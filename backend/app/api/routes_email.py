"""
backend/app/api/routes_email.py
-------------------------------
Candidate outreach and interview invitation email dispatch controller.
"""

import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.core.auth import get_current_user_id
from app.tools.email_tool import send_email_draft

router = APIRouter()
logger = logging.getLogger(__name__)


class EmailRequest(BaseModel):
    email_draft: str
    recipient_email: str


class EmailResponse(BaseModel):
    status: str


@router.post("/email/send", response_model=EmailResponse)
async def send_email_endpoint(
    req: EmailRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Sends a recruiter outreach email. Requires authentication.
    """
    try:
        res = send_email_draft.invoke(
            {"email_draft": req.email_draft, "recipient_email": req.recipient_email}
        )
        return EmailResponse(status=res)
    except Exception as exc:
        import uuid
        ref_id = uuid.uuid4().hex[:8]
        logger.error(f"[email ref={ref_id}] Failed to dispatch email to {req.recipient_email}: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"Email dispatch failed. Please contact support with reference ref={ref_id}"
        )
