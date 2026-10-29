import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import get_current_user_id
from app.services.payment_service import payment_service

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


def test_create_order_success():
    response = client.post("/api/payments/order", json={"plan_id": "pro"})
    assert response.status_code == 200
    data = response.json()
    assert data["plan_id"] == "pro"
    assert data["amount"] == 399900
    assert "order_id" in data


def test_create_order_invalid_plan():
    response = client.post("/api/payments/order", json={"plan_id": "nonexistent_plan"})
    assert response.status_code == 400


def test_verify_payment_signature_mock():
    response = client.post(
        "/api/payments/verify",
        json={
            "razorpay_order_id": "order_test_123",
            "razorpay_payment_id": "pay_test_456",
            "razorpay_signature": "mock_valid_signature",
            "plan_id": "pro",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["status"] == "active"


def test_subscription_status():
    response = client.get("/api/payments/status")
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == TEST_USER_ID
    assert "credits_remaining" in data


def test_webhook_event():
    response = client.post("/api/payments/webhook", json={"event": "payment.captured"})
    assert response.status_code == 200
    assert response.json()["received"] is True
