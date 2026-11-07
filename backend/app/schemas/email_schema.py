"""
backend/app/schemas/email_schema.py
-----------------------------------
Pydantic models for outreach emails, dispatch logging, and audit history.
"""

from typing import Optional, List
from pydantic import BaseModel, Field, field_validator
import re


EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class EmailRequest(BaseModel):
    recipient_email: str = Field(..., description="Target candidate email address")
    email_draft: Optional[str] = Field(None, description="Full raw email text with optional Subject header")
    subject: Optional[str] = Field(None, description="Explicit email subject line")
    body: Optional[str] = Field(None, description="Explicit email body text")
    candidate_id: Optional[str] = Field(None, description="Optional associated candidate UUID")
    template_id: Optional[str] = Field(None, description="Identifier of the template used (interview, offer, rejection, sourcing)")

    @field_validator("recipient_email")
    @classmethod
    def validate_recipient_email(cls, v: str) -> str:
        clean = v.strip()
        if not clean or not EMAIL_REGEX.match(clean):
            raise ValueError(f"Invalid recipient email format: '{clean}'")
        return clean


class EmailResponse(BaseModel):
    status: str = Field(..., description="Dispatch confirmation or status description")
    log_id: Optional[str] = Field(None, description="Unique ID of the saved outreach log")
    dispatch_type: str = Field("simulated", description="'smtp' if sent via live mail server, else 'simulated'")
    credits_remaining: Optional[int] = Field(None, description="Recruiter's updated candidate credit balance")


class OutreachLogItem(BaseModel):
    id: str
    user_id: str
    candidate_id: Optional[str] = None
    recipient_email: str
    subject: str
    body: str
    template_id: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    created_at: str


class OutreachHistoryResponse(BaseModel):
    total: int
    items: List[OutreachLogItem]


class OutreachStatsResponse(BaseModel):
    total_sent: int
    smtp_count: int
    simulated_count: int
    failed_count: int
