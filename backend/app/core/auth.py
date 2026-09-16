"""
backend/app/core/auth.py
------------------------
Hardened JWT Authentication Dependency for FastAPI and Supabase.
Pins HS256 algorithm, verifies aud & exp claims, validates UUID format,
and performs local cryptographic verification prior to any network fallback.
"""

import uuid
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt
from jose.exceptions import JWTError, ExpiredSignatureError, JWTClaimsError
from app.core import config

security = HTTPBearer(auto_error=False)


def _ensure_valid_uuid(uid: str) -> str:
    """
    Ensure user id is a valid UUID string compatible with Postgres schema.
    Rejects arbitrary string user IDs with HTTP 401 to prevent invisible tenant data partitioning.
    """
    try:
        return str(uuid.UUID(str(uid)))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user identification: token subject must be a valid UUID.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    """
    Extracts and validates the JWT from the Authorization header.
    
    Execution Order:
    1. Primary: Fast local cryptographic verification using config.SUPABASE_JWT_SECRET
       pinned strictly to HS256 with mandatory 'aud' and 'exp' claim validation.
    2. Fallback: Supabase Auth network call (client.auth.get_user(token)) only if
       local verification is unconfigured or unable to parse.
    3. Dev Fallback: Unverified claims ONLY when USE_LOCAL_AUTH is explicitly True.
    
    Returns:
        Validated UUID string representing the authenticated user_id.
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

    # 1. Primary: Local cryptographic JWT decode with pinned HS256 and verified claims
    if config.SUPABASE_JWT_SECRET:
        try:
            expected_aud = getattr(config, "SUPABASE_JWT_AUDIENCE", "authenticated") or "authenticated"
            payload = jwt.decode(
                token,
                config.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience=expected_aud,
                options={
                    "verify_aud": True,
                    "verify_exp": True,
                    "verify_signature": True,
                },
            )
            user_id = payload.get("sub")
            if user_id:
                return _ensure_valid_uuid(str(user_id))
        except (ExpiredSignatureError, JWTClaimsError) as e:
            # If token explicitly expired or claims are invalid, reject immediately with 401
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Authentication token verification failed: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except JWTError:
            # Signature mismatch or format error on local secret - allow fallback to Supabase API
            pass
        except Exception:
            pass

    # 2. Fallback: Verify with Supabase Auth API (network call)
    try:
        from app.rag.vector_store import get_supabase_client
        client = get_supabase_client()
        user_res = client.auth.get_user(token)
        if user_res and user_res.user and user_res.user.id:
            return _ensure_valid_uuid(str(user_res.user.id))
    except HTTPException:
        raise
    except Exception:
        pass

    # 3. Fallback: Parse unverified claims ONLY if local dev auth is explicitly enabled
    if config.USE_LOCAL_AUTH:
        try:
            claims = jwt.get_unverified_claims(token)
            user_id = claims.get("sub")
            if user_id:
                return _ensure_valid_uuid(str(user_id))
        except HTTPException:
            raise
        except Exception:
            pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token. Signature verification failed.",
        headers={"WWW-Authenticate": "Bearer"},
    )
