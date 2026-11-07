import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.core.auth import get_current_user_id
from app.rag.vector_store import get_supabase_client
from app.services.payment_service import payment_service

client = TestClient(app)

TEST_USER_A = "a1111111-1111-4111-a111-111111111111"
TEST_USER_B = "b2222222-2222-4222-b222-222222222222"
TEST_CANDIDATE_1 = "c1111111-1111-4111-c111-111111111111"
TEST_CANDIDATE_2 = "c2222222-2222-4222-c222-222222222222"


@pytest.fixture(autouse=True)
def setup_test_auth():
    # Default to TEST_USER_A
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_A
    yield
    app.dependency_overrides = {}


def _set_user_credits(user_id: str, credits: int):
    db = get_supabase_client()
    db.table("users").upsert({
        "id": user_id,
        "email": f"{user_id}@recruitai.local",
        "credits_balance": credits,
    }).execute()


@patch("app.tools.email_tool.SMTP_USERNAME", None)
@patch("app.tools.email_tool.SMTP_PASSWORD", None)
def test_send_email_simulation_mode_and_credit_deduction():
    # 1. Setup user with 5 credits
    _set_user_credits(TEST_USER_A, 5)

    # Ensure no existing logs for this test
    db = get_supabase_client()
    db.table("outreach_logs").delete().eq("user_id", TEST_USER_A).execute()

    payload = {
        "recipient_email": "candidate.alex@example.com",
        "subject": "Interview Invitation: Senior Backend Engineer",
        "body": "Hi Alex, we would like to invite you for an architecture interview.",
        "candidate_id": TEST_CANDIDATE_1,
        "template_id": "interview",
    }

    # 2. Dispatch
    response = client.post("/api/email/send", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["dispatch_type"] == "simulated"
    assert data["log_id"] is not None
    assert data["credits_remaining"] == 4

    # 3. Verify user credit balance in database
    updated_credits = payment_service.get_user_credits(TEST_USER_A)
    assert updated_credits == 4

    # 4. Verify outreach log persistence
    log_res = db.table("outreach_logs").select("*").eq("id", data["log_id"]).execute()
    assert len(log_res.data) == 1
    log = log_res.data[0]
    assert log["user_id"] == TEST_USER_A
    assert log["candidate_id"] == TEST_CANDIDATE_1
    assert log["recipient_email"] == "candidate.alex@example.com"
    assert log["subject"] == "Interview Invitation: Senior Backend Engineer"
    assert log["template_id"] == "interview"
    assert log["status"] == "simulated"


@patch("app.tools.email_tool.SMTP_USERNAME", "recruiter@recruitai.com")
@patch("app.tools.email_tool.SMTP_PASSWORD", "supersecret")
@patch("app.tools.email_tool.SMTP_SERVER", "smtp.recruitai.com")
@patch("app.tools.email_tool.SMTP_PORT", 587)
@patch("smtplib.SMTP")
def test_send_email_smtp_mode_success(mock_smtp_cls):
    # Setup mock SMTP server
    mock_smtp_instance = MagicMock()
    mock_smtp_cls.return_value.__enter__.return_value = mock_smtp_instance

    _set_user_credits(TEST_USER_A, 10)

    payload = {
        "recipient_email": "dev.lead@example.com",
        "email_draft": "Subject: Job Offer - Principal Architect\n\nDear Lead, We are excited to make you an offer!",
        "candidate_id": TEST_CANDIDATE_2,
        "template_id": "offer",
    }

    response = client.post("/api/email/send", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["dispatch_type"] == "smtp"
    assert "Email sent successfully via SMTP" in data["status"]
    assert data["credits_remaining"] == 9

    # Verify SMTP calls
    mock_smtp_instance.starttls.assert_called_once()
    mock_smtp_instance.login.assert_called_once_with("recruiter@recruitai.com", "supersecret")
    mock_smtp_instance.sendmail.assert_called_once()


def test_send_email_insufficient_credits_raises_402():
    # Set user credits to 0
    _set_user_credits(TEST_USER_A, 0)

    payload = {
        "recipient_email": "candidate@example.com",
        "subject": "Quick Catchup",
        "body": "Let's connect this week.",
    }

    response = client.post("/api/email/send", json=payload)
    assert response.status_code == 402
    data = response.json()
    assert data["detail"]["error"] == "INSUFFICIENT_CREDITS"
    assert "upgrade_url" in data["detail"]


def test_send_email_invalid_recipient_validation():
    _set_user_credits(TEST_USER_A, 10)

    payload = {
        "recipient_email": "not-a-valid-email",
        "subject": "Hello",
        "body": "Testing invalid email.",
    }

    response = client.post("/api/email/send", json=payload)
    assert response.status_code == 422


@patch("app.tools.email_tool.SMTP_USERNAME", None)
@patch("app.tools.email_tool.SMTP_PASSWORD", None)
def test_outreach_history_and_stats_with_isolation():
    # Setup Recruiter A with 10 credits
    _set_user_credits(TEST_USER_A, 10)

    # Clean existing logs for User A
    db = get_supabase_client()
    db.table("outreach_logs").delete().eq("user_id", TEST_USER_A).execute()
    db.table("outreach_logs").delete().eq("user_id", TEST_USER_B).execute()

    # Send 2 emails for User A (one for Candidate 1, one for Candidate 2)
    client.post("/api/email/send", json={
        "recipient_email": "cand1@example.com",
        "subject": "Candidate 1 Invite",
        "body": "Invite body",
        "candidate_id": TEST_CANDIDATE_1,
        "template_id": "interview",
    })

    client.post("/api/email/send", json={
        "recipient_email": "cand2@example.com",
        "subject": "Candidate 2 Rejection",
        "body": "Rejection body",
        "candidate_id": TEST_CANDIDATE_2,
        "template_id": "rejection",
    })

    # Test full history
    res_history = client.get("/api/email/history")
    assert res_history.status_code == 200
    hist_data = res_history.json()
    assert hist_data["total"] == 2
    assert len(hist_data["items"]) == 2

    # Test candidate filtered history
    res_cand1 = client.get(f"/api/email/history?candidate_id={TEST_CANDIDATE_1}")
    assert res_cand1.status_code == 200
    cand1_data = res_cand1.json()
    assert cand1_data["total"] == 1
    assert cand1_data["items"][0]["recipient_email"] == "cand1@example.com"

    # Test stats
    res_stats = client.get("/api/email/stats")
    assert res_stats.status_code == 200
    stats = res_stats.json()
    assert stats["total_sent"] == 2
    assert stats["simulated_count"] == 2

    # Switch to User B and verify multi-tenant isolation
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_B
    res_b = client.get("/api/email/history")
    assert res_b.status_code == 200
    assert res_b.json()["total"] == 0
