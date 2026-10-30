from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime


class PricingPlan(BaseModel):
    id: str
    name: str
    amount: int  # in paise (e.g. 149900 = ₹1,499)
    currency: str = "INR"
    interval: str = "monthly"
    candidate_quota: int
    features: List[str]


class CreateOrderRequest(BaseModel):
    plan_id: str


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str
    key_id: Optional[str] = None
    plan_id: str


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan_id: Optional[str] = None


class VerifyPaymentResponse(BaseModel):
    success: bool
    message: str
    status: str
    subscription_id: Optional[str] = None
    plan_id: Optional[str] = None
    credits_remaining: Optional[int] = None


class SubscriptionStatusResponse(BaseModel):
    user_id: str
    plan_id: str
    status: str
    credits_remaining: int
    current_period_end: Optional[str] = None


class CreditTransactionResponse(BaseModel):
    id: str
    user_id: str
    amount: int
    balance_after: int
    reason: str
    created_at: str


class ConsumeCreditRequest(BaseModel):
    amount: int = Field(default=1, ge=1)
    reason: str = Field(default="candidate_analysis")


class ConsumeCreditResponse(BaseModel):
    success: bool
    credits_remaining: int
    amount_deducted: int
    reason: str
