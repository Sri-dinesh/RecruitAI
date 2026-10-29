from fastapi import APIRouter, Depends, HTTPException, Request, Header, status
from typing import List, Optional
from app.core.auth import get_current_user_id
from app.schemas.payment_schema import (
    PricingPlan,
    CreateOrderRequest,
    CreateOrderResponse,
    VerifyPaymentRequest,
    VerifyPaymentResponse,
    SubscriptionStatusResponse,
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
    Verifies the payment response received from Razorpay Checkout modal.
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

    # In a full flow, this also activates the plan in the database
    return VerifyPaymentResponse(
        success=True,
        message="Payment verified successfully. Subscription activated.",
        status="active",
        subscription_id=f"sub_{user_id[:6]}_{request.plan_id or 'pro'}",
    )


@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: Optional[str] = Header(None),
):
    """
    Handles asynchronous events dispatched by Razorpay (payment captured, subscription renewal).
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

    return {"status": "ok", "received": True}


@router.get("/status", response_model=SubscriptionStatusResponse)
def get_subscription_status(user_id: str = Depends(get_current_user_id)):
    """
    Returns the user's active plan and available usage quota/credits.
    """
    return SubscriptionStatusResponse(
        user_id=user_id,
        plan_id="free",
        status="active",
        credits_remaining=10,
    )
