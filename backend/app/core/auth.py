"""
backend/app/core/auth.py
------------------------
JWT Authentication Dependency for FastAPI.
Validates Supabase-issued Bearer tokens and extracts the authenticated user_id.
Supports a local development bypass mode via USE_LOCAL_AUTH=true.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.core.config import SUPABASE_JWT_SECRET, USE_LOCAL_AUTH

# Auto-error=False so we can return a clean 401 instead of a generic 403
security = HTTPBearer(auto_error=False)

LOCAL_DEV_USER_ID = "local_dev_user_123"


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """
    FastAPI dependency that:
      1. In local dev mode (USE_LOCAL_AUTH=true): returns a fixed user ID,
         so the backend works without a Supabase project configured.
      2. In production: validates the Supabase JWT Bearer token from the
         Authorization header and returns the authenticated user UUID (sub claim).

    Raises HTTP 401 if the token is missing, expired, or tampered.
    """
    # ── Local development bypass ──────────────────────────────────────────────
    if USE_LOCAL_AUTH:
        return LOCAL_DEV_USER_ID

    # ── Production: require Bearer token ─────────────────────────────────────
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    if not SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server misconfiguration: SUPABASE_JWT_SECRET is not set.",
        )

    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},  # Supabase does not embed aud claim
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user subject (sub) claim.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user_id

    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token validation failed: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
