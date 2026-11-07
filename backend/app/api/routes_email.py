"""
backend/app/api/routes_email.py
-------------------------------
Candidate outreach and interview invitation email dispatch controller.
Features credit quota gating, persistent outreach delivery logging,
delivery stats, and audit history.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query, status

from app.core.auth import get_current_user_id
from app.rag.vector_store import get_supabase_client
from app.services.payment_service import payment_service
from app.tools.email_tool import send_email_draft
from app.schemas.email_schema import (
    EmailRequest,
    EmailResponse,
    OutreachHistoryResponse,
    OutreachLogItem,
    OutreachStatsResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _extract_subject_and_body(req: EmailRequest) -> tuple[str, str, str]:
    """
    Parses and extracts subject, body, and full draft text from the request.
    """
    draft = req.email_draft or ""
    if not draft and req.subject and req.body:
        draft = f"Subject: {req.subject}\n\n{req.body}"
    elif not draft:
        draft = f"Subject: {req.subject or 'RecruitAI Outreach'}\n\n{req.body or ''}"

    lines = draft.split("\n")
    subject_line = next((l for l in lines if l.lower().startswith("subject:")), None)

    if req.subject:
        subject = req.subject.strip()
    elif subject_line:
        subject = subject_line[len("subject:"):].strip()
    else:
        subject = "RecruitAI Outreach"

    if req.body:
        body = req.body.strip()
    elif subject_line:
        body = "\n".join([l for l in lines if not l.lower().startswith("subject:")]).strip()
    else:
        body = draft.strip()

    return subject, body, draft


@router.post("/email/send", response_model=EmailResponse)
async def send_email_endpoint(
    req: EmailRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Sends a recruiter outreach email.
    Verifies that the recruiter has available credits (or returns HTTP 402),
    dispatches the email via SMTP (or simulation fallback),
    deducts 1 credit, and logs the dispatch to public.outreach_logs.
    """
    # 1. Check candidate outreach quota
    current_credits = payment_service.get_user_credits(user_id)
    if current_credits <= 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "error": "INSUFFICIENT_CREDITS",
                "message": "Candidate outreach quota exhausted. Please upgrade to continue.",
                "upgrade_url": "/pricing",
            },
        )

    subject, body, draft_to_send = _extract_subject_and_body(req)

    # 2. Dispatch email via tool
    try:
        res = send_email_draft.invoke(
            {"email_draft": draft_to_send, "recipient_email": req.recipient_email}
        )
    except Exception as exc:
        ref_id = uuid.uuid4().hex[:8]
        logger.error(f"[email ref={ref_id}] Failed to dispatch email to {req.recipient_email}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Email dispatch failed. Please contact support with reference ref={ref_id}",
        )

    # 3. Determine dispatch outcome
    is_smtp_success = "Email sent successfully via SMTP" in res
    is_smtp_failed = "Failed to send email via SMTP" in res

    if is_smtp_failed:
        dispatch_status = "failed"
        dispatch_type = "smtp"
        error_msg = res
    elif is_smtp_success:
        dispatch_status = "sent"
        dispatch_type = "smtp"
        error_msg = None
    else:
        dispatch_status = "simulated"
        dispatch_type = "simulated"
        error_msg = None

    # If SMTP dispatch failed critically, log and raise 500
    if is_smtp_failed:
        try:
            client = get_supabase_client()
            client.table("outreach_logs").insert({
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "candidate_id": req.candidate_id,
                "recipient_email": req.recipient_email,
                "subject": subject,
                "body": body,
                "template_id": req.template_id,
                "status": "failed",
                "error_message": error_msg,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception:
            pass

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"SMTP dispatch failure: {res}",
        )

    # 4. Deduct 1 credit for successful outreach
    updated_credits = current_credits
    try:
        consume_res = payment_service.consume_credits(
            user_id=user_id,
            amount=1,
            reason=f"Candidate outreach email to {req.recipient_email}",
        )
        updated_credits = consume_res.get("credits_remaining", current_credits - 1)
    except Exception as exc:
        logger.warning(f"Credit consumption notice during email dispatch: {exc}")

    # 5. Persist audit log
    log_id = str(uuid.uuid4())
    try:
        client = get_supabase_client()
        client.table("outreach_logs").insert({
            "id": log_id,
            "user_id": user_id,
            "candidate_id": req.candidate_id,
            "recipient_email": req.recipient_email,
            "subject": subject,
            "body": body,
            "template_id": req.template_id,
            "status": dispatch_status,
            "error_message": error_msg,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as exc:
        logger.warning(f"Failed to persist outreach log to database: {exc}")

    return EmailResponse(
        status=res,
        log_id=log_id,
        dispatch_type=dispatch_type,
        credits_remaining=updated_credits,
    )


@router.get("/email/history", response_model=OutreachHistoryResponse)
async def get_outreach_history(
    candidate_id: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
):
    """
    Returns dispatched outreach email history for the authenticated recruiter.
    Supports filtering by specific candidate UUID.
    """
    client = get_supabase_client()
    try:
        query = client.table("outreach_logs").select("*").eq("user_id", user_id)
        if candidate_id:
            query = query.eq("candidate_id", candidate_id)
        query = query.order("created_at", desc=True).limit(limit)
        res = query.execute()

        items = [OutreachLogItem(**row) for row in (res.data or [])]
        return OutreachHistoryResponse(total=len(items), items=items)
    except Exception as exc:
        logger.error(f"Failed to fetch outreach history for user {user_id}: {exc}")
        return OutreachHistoryResponse(total=0, items=[])


@router.get("/email/stats", response_model=OutreachStatsResponse)
async def get_outreach_stats(
    user_id: str = Depends(get_current_user_id),
):
    """
    Returns aggregated delivery statistics of outreach communications for the recruiter.
    """
    client = get_supabase_client()
    try:
        res = client.table("outreach_logs").select("status").eq("user_id", user_id).execute()
        rows = res.data or []
        total = len(rows)
        smtp_count = sum(1 for r in rows if r.get("status") == "sent")
        simulated_count = sum(1 for r in rows if r.get("status") == "simulated")
        failed_count = sum(1 for r in rows if r.get("status") == "failed")

        return OutreachStatsResponse(
            total_sent=total,
            smtp_count=smtp_count,
            simulated_count=simulated_count,
            failed_count=failed_count,
        )
    except Exception as exc:
        logger.error(f"Failed to fetch outreach stats for user {user_id}: {exc}")
        return OutreachStatsResponse(total_sent=0, smtp_count=0, simulated_count=0, failed_count=0)
