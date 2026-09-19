from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Dict, Any
from datetime import datetime

class UserPreferences(BaseModel):
    email_alerts: bool = True
    theme: str = "system"
    blind_mode_default: bool = False
    auto_rubric: bool = True
    match_threshold: int = 75
    default_export_format: str = "pdf"
    digest_frequency: str = "instant"
    sound_effects: bool = True

class UserProfileResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    company_website: Optional[str] = None
    department: Optional[str] = None
    role: str = "recruiter"
    preferences: Dict[str, Any] = Field(default_factory=dict)
    last_sign_in_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    company_website: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None
