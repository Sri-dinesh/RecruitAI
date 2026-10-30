"""
Quota verification dependency and credit gating exceptions for RecruitAI monetization.
"""

from fastapi import Depends, HTTPException, status
from app.core.auth import get_current_user_id
from app.services.payment_service import payment_service


class InsufficientCreditsException(HTTPException):
    def __init__(self, detail: str = "Candidate evaluation quota reached. Please upgrade your subscription to continue."):
        super().__init__(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "error": "INSUFFICIENT_CREDITS",
                "message": detail,
                "upgrade_url": "/pricing",
            },
        )


def require_candidate_quota(user_id: str = Depends(get_current_user_id)) -> int:
    """
    FastAPI dependency ensuring the requesting user has at least 1 credit available.
    Returns current credit balance or raises HTTP 402 Payment Required.
    """
    balance = payment_service.get_user_credits(user_id)
    if balance <= 0:
        raise InsufficientCreditsException()
    return balance
