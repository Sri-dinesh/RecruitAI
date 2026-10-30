import pytest
import hmac
import hashlib
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import get_current_user_id
from app.services.payment_service import payment_service
from app.rag.vector_store import get_supabase_client

client = TestClient(app)

TEST_USER_ID = "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3"


@pytest.fixture(autouse=True)
def setup_test_auth():
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID
    yield
    app.dependency_overrides = {}


def test_list_pricing_plans():
    response = client.get("/api/payments/plans")
    assert response.status_code == 200
    plans = response.json()
    assert len(plans) >= 3
    plan_ids = [p["id"] for p in plans]
    assert "starter" in plan_ids
    assert "pro" in plan_ids
    assert "agency" in plan_ids

    starter = next(p for p in plans if p["id"] == "starter")
    assert starter["amount"] == 149900
    assert starter["candidate_quota"] == 50
    assert len(starter["features"]) > 0


def test_create_order_success():
    response = client.post("/api/payments/order", json={"plan_id": "pro"})
    assert response.status_code == 200
    data = response.json()
    assert data["plan_id"] == "pro"
    assert data["amount"] == 399900
    assert "order_id" in data
    assert data["currency"] == "INR"


def test_create_order_invalid_plan():
    response = client.post("/api/payments/order", json={"plan_id": "nonexistent_plan"})
    assert response.status_code == 400


def test_verify_payment_signature_and_db_persistence():
    # 1. Reset user credits to baseline
    db = get_supabase_client()
    db.table("users").upsert({
        "id": TEST_USER_ID,
        "email": "test_subscriber@recruitai.local",
        "credits_balance": 10
    }).execute()

    # 2. Verify payment for Starter plan (+50 credits)
    response = client.post(
        "/api/payments/verify",
        json={
            "razorpay_order_id": "order_verify_123",
            "razorpay_payment_id": "pay_verify_456",
            "razorpay_signature": "mock_valid_signature",
            "plan_id": "starter",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["status"] == "active"
    assert data["plan_id"] == "starter"
    assert data["credits_remaining"] == 60  # 10 baseline + 50 Starter quota

    # 3. Query status endpoint to verify DB state
    status_res = client.get("/api/payments/status")
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["user_id"] == TEST_USER_ID
    assert status_data["plan_id"] == "starter"
    assert status_data["status"] == "active"
    assert status_data["credits_remaining"] == 60


def test_consume_credits_and_transaction_audit():
    # 1. Set known credit balance
    db = get_supabase_client()
    db.table("users").upsert({
        "id": TEST_USER_ID,
        "credits_balance": 20
    }).execute()

    # 2. Consume 3 credits
    consume_res = client.post(
        "/api/payments/consume-credit",
        json={"amount": 3, "reason": "Batch resume analysis"},
    )
    assert consume_res.status_code == 200
    res_data = consume_res.json()
    assert res_data["success"] is True
    assert res_data["credits_remaining"] == 17
    assert res_data["amount_deducted"] == 3

    # 3. Fetch credit transaction ledger
    tx_res = client.get("/api/payments/transactions")
    assert tx_res.status_code == 200
    tx_list = tx_res.json()
    assert len(tx_list) >= 1
    latest_tx = tx_list[0]
    assert latest_tx["amount"] == -3
    assert latest_tx["balance_after"] == 17
    assert "Batch resume analysis" in latest_tx["reason"]


def test_webhook_payment_captured_activates_subscription():
    webhook_user_id = "user_webhook_test_99"
    webhook_payload = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_hook_987",
                    "order_id": "order_hook_654",
                    "amount": 399900,
                    "status": "captured",
                    "notes": {
                        "user_id": webhook_user_id,
                        "plan_id": "pro",
                    },
                }
            }
        },
    }

    response = client.post("/api/payments/webhook", json=webhook_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["received"] is True
    assert data["result"]["status"] == "processed"
    assert data["result"]["subscription_activated"] is True
    assert data["result"]["plan_id"] == "pro"

    # Verify subscription in database
    db = get_supabase_client()
    sub_res = db.table("subscriptions").select("*").eq("user_id", webhook_user_id).execute()
    assert sub_res.data
    assert sub_res.data[0]["plan_id"] == "pro"
    assert sub_res.data[0]["status"] == "active"


def test_webhook_invalid_signature_rejected(monkeypatch):
    monkeypatch.setattr(payment_service, "webhook_secret", "real_test_secret_key_123")
    body = b'{"event":"test"}'
    invalid_sig = "invalid_hex_signature"

    response = client.post(
        "/api/payments/webhook",
        content=body,
        headers={"x-razorpay-signature": invalid_sig, "Content-Type": "application/json"},
    )
    assert response.status_code == 400
    assert "Invalid webhook signature" in response.json()["detail"]


def test_candidate_evaluation_quota_gating():
    exhausted_user = "user_exhausted_credits_000"
    app.dependency_overrides[get_current_user_id] = lambda: exhausted_user

    db = get_supabase_client()
    # Set 0 credits
    db.table("users").upsert({
        "id": exhausted_user,
        "email": "zero_credits@recruitai.local",
        "credits_balance": 0
    }).execute()

    # Attempt to evaluate candidate
    eval_res = client.post("/api/candidates/evaluate", json={
        "candidate_id": "cand_quota_test",
        "tech_score": 4,
        "comm_score": 4,
        "notes": "Testing quota gate"
    })
    assert eval_res.status_code == 402
    err_body = eval_res.json()["detail"]
    assert err_body["error"] == "INSUFFICIENT_CREDITS"
    assert err_body["upgrade_url"] == "/pricing"

    # Replenish quota via subscription
    payment_service.activate_subscription(
        user_id=exhausted_user,
        plan_id="starter",
        razorpay_order_id="order_replenish_1",
        razorpay_payment_id="pay_replenish_1"
    )

    # Now evaluate should succeed
    eval_res2 = client.post("/api/candidates/evaluate", json={
        "candidate_id": "cand_quota_test",
        "tech_score": 4,
        "comm_score": 4,
        "notes": "Testing quota gate after upgrade"
    })
    assert eval_res2.status_code == 200
    assert eval_res2.json()["status"] == "success"

    # And 1 credit was consumed (50 starter - 1 = 49)
    assert payment_service.get_user_credits(exhausted_user) == 49
