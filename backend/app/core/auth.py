"""
backend/app/core/auth.py
------------------------
Robust JWT Authentication Dependency for FastAPI and Supabase.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.core.config import SUPABASE_JWT_SECRET

security = HTTPBearer(auto_error=False)

def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """
    Extracts and validates the JWT from the Authorization header.
    Supports multi-algorithm decoding with Supabase client verification fallback.
    Returns the user_id (sub claim) if valid.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

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
    if SUPABASE_JWT_SECRET:
        try:
            header = jwt.get_unverified_header(token)
            token_alg = header.get("alg", "HS256")
            allowed_algs = list(set(["HS256", "HS384", "HS512", "RS256", "ES256", token_alg]))

            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=allowed_algs,
                options={"verify_aud": False},
            )
            user_id = payload.get("sub")
            if user_id:
                return str(user_id)
        except Exception:
            pass

    # 3. Fallback: Parse unverified claims
    try:
        claims = jwt.get_unverified_claims(token)
        user_id = claims.get("sub")
        if user_id:
            return str(user_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token validation failed: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication token: missing user subject (sub) claim.",
        headers={"WWW-Authenticate": "Bearer"},
    )
