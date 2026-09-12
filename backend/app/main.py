import time
from datetime import datetime, timezone
from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes_chat import router as chat_router
from app.api.routes_reports import router as reports_router
from app.api.routes_ingest import router as ingest_router
from app.api.routes_evaluate import router as evaluate_router
from app.api.routes_analytics import router as analytics_router

import os

app = FastAPI(title="RecruitAI API Server", version="2.0")

SERVER_START_TIME = time.time()

# Strict, secure CORS policy: only whitelist authorized production web clients & local dev
DEFAULT_ALLOWED_ORIGINS = [
    "https://recruitaiofficial.vercel.app",
    "https://recruitai.vercel.app",
    "http://localhost:3000",
    "http://localhost:8081",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8081",
]
env_origins = os.getenv("ALLOWED_ORIGINS", "")
allowed_origins = list(DEFAULT_ALLOWED_ORIGINS)
if env_origins:
    for o in env_origins.split(","):
        clean_o = o.strip()
        if clean_o and clean_o not in allowed_origins:
            allowed_origins.append(clean_o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https:\/\/recruitai(-[a-zA-Z0-9]+)?\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(chat_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(ingest_router, prefix="/api")
app.include_router(evaluate_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "RecruitAI backend API server is running successfully."}

async def check_system_health(response: Response) -> dict:
    """
    Performs deep diagnostic health checks across all backend subsystems:
    1. Database (Supabase PostgreSQL / SQLite fallback ping)
    2. LLM / AI Model Provider configuration
    3. Authentication subsystem status
    """
    services = {}
    overall_healthy = True
    is_degraded = False

    # 1. Check Database connectivity
    db_start = time.time()
    try:
        from app.rag.vector_store import get_supabase_client, _use_local_sqlite
        client = get_supabase_client()
        # Query a single row as a fast ping
        client.table("chat_sessions").select("id").limit(1).execute()
        db_latency_ms = round((time.time() - db_start) * 1000, 2)
        db_type = "sqlite_fallback" if _use_local_sqlite else "supabase_postgresql"
        services["database"] = {
            "status": "healthy",
            "type": db_type,
            "latency_ms": db_latency_ms,
        }
        if _use_local_sqlite:
            is_degraded = True
    except Exception as e:
        overall_healthy = False
        services["database"] = {
            "status": "unhealthy",
            "error": str(e),
            "latency_ms": round((time.time() - db_start) * 1000, 2),
        }

    # 2. Check LLM Configuration
    try:
        from app.core.config import GEMINI_API_KEY
        from app.core.llm_router import ROTATING_MODELS
        if GEMINI_API_KEY and "your_gemini" not in GEMINI_API_KEY:
            services["llm"] = {
                "status": "configured",
                "provider": "google_gemini",
                "models": ROTATING_MODELS,
                "strategy": "round_robin_5_models",
            }
        else:
            is_degraded = True
            services["llm"] = {
                "status": "unconfigured",
                "warning": "GEMINI_API_KEY is missing or unconfigured in environment",
            }
    except Exception as e:
        services["llm"] = {"status": "error", "error": str(e)}

    # 3. Check Authentication Configuration
    try:
        from app.core.config import USE_LOCAL_AUTH, SUPABASE_JWT_SECRET
        auth_mode = "local_dev" if USE_LOCAL_AUTH else ("supabase_jwt" if SUPABASE_JWT_SECRET else "unconfigured_jwt")
        services["auth"] = {
            "mode": auth_mode,
            "local_auth_enabled": USE_LOCAL_AUTH,
        }
    except Exception as e:
        services["auth"] = {"status": "error", "error": str(e)}

    # Determine overall status code and label
    if not overall_healthy:
        overall_status = "unhealthy"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    elif is_degraded:
        overall_status = "degraded"
        response.status_code = status.HTTP_200_OK
    else:
        overall_status = "healthy"
        response.status_code = status.HTTP_200_OK

    return {
        "status": overall_status,
        "message": "RecruitAI backend API server is operational.",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": round(time.time() - SERVER_START_TIME, 2),
        "version": "2.0.0",
        "services": services,
    }

@app.get("/health")
async def health_check(response: Response):
    """
    Comprehensive system health check at /health.
    Inspects Database ping, LLM configuration, and Auth services.
    """
    return await check_system_health(response)

@app.get("/api/health")
async def api_health_check(response: Response):
    """
    Health check alias at /api/health for web clients and mobile app.
    """
    return await check_system_health(response)

def start_server():
    """
    Starts the FastAPI server using Uvicorn.
    """
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

if __name__ == "__main__":
    start_server()
