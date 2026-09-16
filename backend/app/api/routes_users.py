import json
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from app.core import config
from app.core.auth import get_current_user_id
from app.rag.vector_store import get_supabase_client
from app.schemas.user_schema import UserProfileResponse, UserUpdateRequest

router = APIRouter(prefix="/api/users", tags=["Users"])


def _parse_preferences(prefs: Any) -> Dict[str, Any]:
    defaults = {
        "email_alerts": True,
        "theme": "system",
        "blind_mode_default": True,
        "auto_rubric": True,
        "match_threshold": 75,
        "default_export_format": "pdf",
        "digest_frequency": "instant",
        "sound_effects": True,
    }
    if isinstance(prefs, str):
        try:
            parsed = json.loads(prefs)
            return {**defaults, **parsed} if isinstance(parsed, dict) else defaults
        except Exception:
            return defaults
    if isinstance(prefs, dict):
        return {**defaults, **prefs}
    return defaults


@router.get("/me", response_model=UserProfileResponse)
def get_current_user_profile(user_id: str = Depends(get_current_user_id)):
    """
    Returns the current authenticated recruiter's profile from the public.users table.
    """
    client = get_supabase_client()
    try:
        res = client.table("users").select("*").eq("id", user_id).execute()
        if res.data and len(res.data) > 0:
            user_data = dict(res.data[0])
            user_data["preferences"] = _parse_preferences(user_data.get("preferences"))
            return user_data
    except Exception as e:
        if getattr(config, "IS_PRODUCTION", False):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error fetching user profile: {e}",
            )

    # Default profile fallback for initial dev setup
    return {
        "id": user_id,
        "email": f"{user_id}@recruitai.local",
        "full_name": "Lead Recruiter",
        "role": "recruiter",
        "preferences": {
            "email_alerts": True,
            "theme": "system",
            "blind_mode_default": True,
            "auto_rubric": True,
        },
    }


@router.patch("/me", response_model=UserProfileResponse)
def update_current_user_profile(
    payload: UserUpdateRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Updates profile fields for the authenticated recruiter.
    """
    client = get_supabase_client()
    update_data: Dict[str, Any] = {}

    if payload.full_name is not None:
        update_data["full_name"] = payload.full_name.strip()
    if payload.avatar_url is not None:
        update_data["avatar_url"] = payload.avatar_url.strip()
    if payload.phone is not None:
        update_data["phone"] = payload.phone.strip()
    if payload.company_name is not None:
        update_data["company_name"] = payload.company_name.strip()
    if payload.company_website is not None:
        update_data["company_website"] = payload.company_website.strip()
    if payload.role is not None and payload.role in ("recruiter", "employer"):
        update_data["role"] = payload.role
    if payload.preferences is not None:
        update_data["preferences"] = payload.preferences

    if not update_data:
        return get_current_user_profile(user_id)

    try:
        res = client.table("users").update(update_data).eq("id", user_id).execute()
        if res.data and len(res.data) > 0:
            user_data = dict(res.data[0])
            user_data["preferences"] = _parse_preferences(user_data.get("preferences"))
            return user_data
    except Exception as e:
        if getattr(config, "IS_PRODUCTION", False):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error updating user profile: {e}",
            )

    current = get_current_user_profile(user_id)
    if isinstance(current, dict):
        current.update(update_data)
        current["preferences"] = _parse_preferences(current.get("preferences"))
        return current

    return current
