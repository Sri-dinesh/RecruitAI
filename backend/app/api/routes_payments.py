from fastapi import APIRouter, Depends, HTTPException, Request, Header, status
from typing import List, Optional
import json

from app.core.auth import get_current_user_id
from app.schemas.payment_schema import (
    PricingPlan,
    CreateOrderRequest,
    CreateOrderResponse,
    VerifyPaymentRequest,
    VerifyPaymentResponse,
    SubscriptionStatusResponse,
    CreditTransactionResponse,
    ConsumeCreditRequest,
    ConsumeCreditResponse,
)
from app.services.payment_service import payment_service

router = APIRouter(prefix="/api/payments", tags=["Payments & Monetization"])


@router.get("/plans", response_model=List[PricingPlan])
def list_pricing_plans():
    """
    Returns public pricing tiers to display on the pricing page or upgrade modal.
    """
    return payment_service.get_plans()


@router.post("/order", response_model=CreateOrderResponse)
def create_payment_order(
    request: CreateOrderRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Initializes a Razorpay order for the selected subscription plan.
    """
    try:
        order = payment_service.create_order(plan_id=request.plan_id, user_id=user_id)
        return order
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to create order: {str(e)}",
        )


@router.post("/verify", response_model=VerifyPaymentResponse)
def verify_payment(
    request: VerifyPaymentRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Verifies the payment response received from Razorpay Checkout modal
    and persists subscription & quota activation directly to the database.
    """
    is_valid = payment_service.verify_payment_signature(
        order_id=request.razorpay_order_id,
        payment_id=request.razorpay_payment_id,
        signature=request.razorpay_signature,
    )

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payment signature. Verification failed.",
        )

    plan_id = request.plan_id or "starter"
    try:
        sub_info = payment_service.activate_subscription(
            user_id=user_id,
            plan_id=plan_id,
            razorpay_order_id=request.razorpay_order_id,
            razorpay_payment_id=request.razorpay_payment_id,
        )
        return VerifyPaymentResponse(
            success=True,
            message="Payment verified successfully. Subscription activated.",
            status="active",
            subscription_id=sub_info.get("subscription_id"),
            plan_id=sub_info.get("plan_id"),
            credits_remaining=sub_info.get("credits_remaining"),
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to activate subscription: {str(e)}",
        )


@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: Optional[str] = Header(None),
):
    """
    Handles asynchronous events dispatched by Razorpay (payment.captured, order.paid, subscription.charged).
    """
    body_bytes = await request.body()
    if x_razorpay_signature:
        is_valid = payment_service.verify_webhook_signature(
            raw_body=body_bytes,
            signature=x_razorpay_signature,
        )
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid webhook signature.",
            )

    try:
        event_payload = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload in webhook body.",
        )

    result = payment_service.process_webhook_event(event_payload)
    return {"status": "ok", "received": True, "result": result}


@router.get("/status", response_model=SubscriptionStatusResponse)
def get_subscription_status(user_id: str = Depends(get_current_user_id)):
    """
    Returns the user's active plan, expiry date, and available usage quota/credits from the database.
    """
    status_info = payment_service.get_subscription_status(user_id)
    return SubscriptionStatusResponse(
        user_id=status_info["user_id"],
        plan_id=status_info["plan_id"],
        status=status_info["status"],
        credits_remaining=status_info["credits_remaining"],
        current_period_end=status_info.get("current_period_end"),
    )


@router.get("/transactions", response_model=List[CreditTransactionResponse])
def get_credit_transactions(user_id: str = Depends(get_current_user_id)):
    """
    Returns credit transaction audit history for the authenticated recruiter.
    """
    records = payment_service.get_credit_transactions(user_id)
    return [
        CreditTransactionResponse(
            id=str(r.get("id")),
            user_id=str(r.get("user_id")),
            amount=int(r.get("amount", 0)),
            balance_after=int(r.get("balance_after", 0)),
            reason=str(r.get("reason", "")),
            created_at=str(r.get("created_at", "")),
        )
        for r in records
    ]


@router.post("/consume-credit", response_model=ConsumeCreditResponse)
def consume_credit(
    request: ConsumeCreditRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Deducts analysis credits from the authenticated user's balance.
    """
    try:
        res = payment_service.consume_credits(
            user_id=user_id,
            amount=request.amount,
            reason=request.reason,
        )
        return ConsumeCreditResponse(
            success=res["success"],
            credits_remaining=res["credits_remaining"],
            amount_deducted=res["amount_deducted"],
            reason=res["reason"],
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=str(e),
        )
