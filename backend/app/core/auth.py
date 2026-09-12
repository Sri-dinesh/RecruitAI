"""
backend/app/core/auth.py
------------------------
Robust JWT Authentication Dependency for FastAPI and Supabase.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import uuid
from app.core import config

security = HTTPBearer(auto_error=False)


def _ensure_valid_uuid(uid: str) -> str:
    """Ensure user id is a valid UUID string compatible with Postgres schema."""
    try:
        return str(uuid.UUID(uid))
    except (ValueError, AttributeError):
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, uid))


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """
    Extracts and validates the JWT from the Authorization header.
    Supports multi-algorithm decoding with Supabase client verification fallback.
    Returns the user_id (sub claim) if valid.
    """
    if not credentials or not credentials.credentials:
        if config.USE_LOCAL_AUTH:
            return config.LOCAL_DEV_USER_ID
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    if config.USE_LOCAL_AUTH and token in ("mock-token", "local-token", "test-token", "local_dev_user_123"):
        return config.LOCAL_DEV_USER_ID

    # 1. Primary: Verify directly with Supabase Auth API
    try:
        from app.rag.vector_store import get_supabase_client
        client = get_supabase_client()
        user_res = client.auth.get_user(token)
        if user_res and user_res.user and user_res.user.id:
            return str(user_res.user.id)
    except Exception:
        pass

    # 2. Secondary: Local cryptographic JWT decode with dynamic algorithm support
    if config.SUPABASE_JWT_SECRET:
        try:
            header = jwt.get_unverified_header(token)
            token_alg = header.get("alg", "HS256")
            allowed_algs = list(set(["HS256", "HS384", "HS512", "RS256", "ES256", token_alg]))

            payload = jwt.decode(
                token,
                config.SUPABASE_JWT_SECRET,
                algorithms=allowed_algs,
                options={"verify_aud": False},
            )
            user_id = payload.get("sub")
            if user_id:
                return _ensure_valid_uuid(str(user_id))
        except Exception:
            pass

    # 3. Fallback: Parse unverified claims ONLY if local dev auth is explicitly enabled
    if config.USE_LOCAL_AUTH:
        try:
            claims = jwt.get_unverified_claims(token)
            user_id = claims.get("sub")
            if user_id:
                return _ensure_valid_uuid(str(user_id))
        except Exception:
            pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token. Signature verification failed.",
        headers={"WWW-Authenticate": "Bearer"},
    )
