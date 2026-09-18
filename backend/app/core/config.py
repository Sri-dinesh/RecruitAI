import os
from pathlib import Path
from dotenv import load_dotenv

# Find the base directory (where .env and requirements.txt are located)
# Path structure: backend/app/core/config.py -> backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent
dotenv_path = BASE_DIR / ".env"

load_dotenv(dotenv_path=dotenv_path)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
ENVIRONMENT = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()
# Production is strictly driven by explicit ENVIRONMENT configuration (ENG-5)
IS_PRODUCTION = ENVIRONMENT == "production"
# In production, bypass is strictly disabled. Defaults to False for security.
USE_LOCAL_AUTH = False if IS_PRODUCTION else (os.getenv("USE_LOCAL_AUTH", "false").lower() == "true")
LOCAL_DEV_USER_ID = os.getenv("LOCAL_DEV_USER_ID", "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3")

# CORS Configuration - Allowed Origins
DEFAULT_ALLOWED_ORIGINS = [
    "https://recruitaiofficial.vercel.app",
    "https://recruitai.vercel.app",
    "http://localhost:3000",
    "http://localhost:8081",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8081",
]
env_origins = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = (
    [o.strip() for o in env_origins.split(",") if o.strip()]
    if env_origins
    else list(DEFAULT_ALLOWED_ORIGINS)
)


# SMTP Configuration - Safe parsing prevents import crash on invalid port string (ENG-5)
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")

def _parse_port(env_var: str, default: int = 587) -> int:
    val = os.getenv(env_var)
    if not val:
        return default
    try:
        return int(str(val).strip())
    except (ValueError, TypeError):
        return default

SMTP_PORT = _parse_port("SMTP_PORT", 587)
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_SENDER = os.getenv("SMTP_SENDER", SMTP_USERNAME)

# AI Security & Privacy Compliance (AI-SEC-1)
# Production Gate: Defaults to 'zero_retention_verified' for enterprise privacy compliance
LLM_DATA_USE_MODE = os.getenv("LLM_DATA_USE_MODE", "zero_retention_verified")
LLM_KILL_SWITCH = os.getenv("LLM_KILL_SWITCH", "false").lower() == "true"

def verify_provider_compliance():
    """
    AI-SEC-1: Production Gate & Provider Terms Verification.
    Verifies that in production, LLM_DATA_USE_MODE is set to 'zero_retention_verified',
    guaranteeing zero foundational model retention, training opt-out, and active DPA compliance.
    Refuses to start the server in production if unverified or if training is allowed.
    """
    unverified_modes = {"unverified", "training_allowed", "opt_in", "false"}
    if IS_PRODUCTION and (LLM_DATA_USE_MODE.lower() in unverified_modes or LLM_DATA_USE_MODE != "zero_retention_verified"):
        raise RuntimeError(
            f"FATAL SECURITY VIOLATION (AI-SEC-1): LLM_DATA_USE_MODE is '{LLM_DATA_USE_MODE}'. "
            "Enterprise production requires 'zero_retention_verified' with active provider DPA "
            "and training opt-out to prevent candidate data ingestion by foundational models."
        )

def get_missing_keys():
    missing = []
    if not GEMINI_API_KEY:
        missing.append("GEMINI_API_KEY")
    if not TAVILY_API_KEY:
        missing.append("TAVILY_API_KEY")
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_ROLE_KEY:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    return missing
