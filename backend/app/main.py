import os
import time
import uuid
import logging
import uvicorn
from datetime import datetime, timezone
from fastapi import FastAPI, Response, Request, Depends, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes_chat import router as chat_router
from app.api.routes_sessions import router as sessions_router
from app.api.routes_email import router as email_router
from app.api.routes_reports import router as reports_router
from app.api.routes_ingest import router as ingest_router
from app.api.routes_evaluate import router as evaluate_router
from app.api.routes_analytics import router as analytics_router
from app.api.routes_users import router as users_router
from app.api.routes_privacy import router as privacy_router
from app.core.config import verify_provider_compliance, IS_PRODUCTION
from app.core.auth import get_current_user_id

logger = logging.getLogger("recruitai.server")

# AI-SEC-1 Production gate verification on server import
verify_provider_compliance()

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


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Centralized exception handler ensuring opaque errors with server tracking IDs (ENG-5).
    Guarantees internal stack traces, DB credentials, and prompt text never leak to clients.
    """
    ref_id = uuid.uuid4().hex[:8]
    logger.error(
        f"[UNHANDLED_EXCEPTION ref={ref_id}] {request.method} {request.url.path}: "
        f"{type(exc).__name__}: {exc}"
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": f"An unexpected server error occurred. (ref={ref_id})",
            "ref": ref_id,
        },
    )


# Include API routes
app.include_router(chat_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(email_router, prefix="/api")
app.include_router(privacy_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(ingest_router, prefix="/api")
app.include_router(evaluate_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(users_router)


@app.get("/")
def read_root():
    return {"message": "RecruitAI backend API server is running successfully."}


# -----------------------------------------------------------------------------
# Health Probes (ENG-5)
# -----------------------------------------------------------------------------

@app.get("/health")
@app.get("/api/health")
async def liveness_probe(response: Response):
    """
    Shallow public liveness probe (ENG-5).
    Provides quick, zero-leak liveness status for load balancers without exposing
    internal database topology or database error strings.
    """
    return {
        "status": "healthy",
        "message": "RecruitAI backend API server is operational.",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": round(time.time() - SERVER_START_TIME, 2),
        "version": "2.0.0",
    }


async def check_system_readiness(response: Response) -> dict:
    """
    Deep diagnostic readiness check across all backend subsystems (ENG-5):
    1. Database connectivity (Supabase PostgreSQL / SQLite fallback ping)
    2. LLM / AI Model Provider configuration
    3. Authentication subsystem status
    Redacts raw exception strings to eliminate public reconnaissance leaks.
    """
    services = {}
    overall_healthy = True
    is_degraded = False

    # 1. Check Database connectivity
    db_start = time.time()
    try:
        from app.rag.vector_store import get_supabase_client, _use_local_sqlite
        client = get_supabase_client()
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
            "error_type": type(e).__name__,
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
            }
        else:
            is_degraded = True
            services["llm"] = {
                "status": "unconfigured",
                "warning": "GEMINI_API_KEY is missing or unconfigured",
            }
    except Exception as e:
        services["llm"] = {"status": "error", "error_type": type(e).__name__}

    # 3. Check Authentication Configuration
    try:
        from app.core.config import USE_LOCAL_AUTH, SUPABASE_JWT_SECRET
        auth_mode = "local_dev" if USE_LOCAL_AUTH else ("supabase_jwt" if SUPABASE_JWT_SECRET else "unconfigured_jwt")
        services["auth"] = {
            "mode": auth_mode,
            "local_auth_enabled": USE_LOCAL_AUTH,
        }
    except Exception as e:
        services["auth"] = {"status": "error", "error_type": type(e).__name__}

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
        "message": "RecruitAI readiness diagnostics completed.",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": round(time.time() - SERVER_START_TIME, 2),
        "version": "2.0.0",
        "services": services,
    }


@app.get("/health/ready")
@app.get("/api/health/ready")
async def deep_readiness_check(
    response: Response,
    user_id: str = Depends(get_current_user_id),
):
    """
    Authenticated deep readiness probe (ENG-5).
    Eliminates public reconnaissance risks by requiring authentication.
    """
    return await check_system_readiness(response)


@app.get("/api/metrics")
async def get_metrics_endpoint(
    request: Request,
    user_id: str = Depends(get_current_user_id),
):
    """
    RED/USE Operational metrics & Prometheus export (OPS-1).
    Returns real-time rates, errors, p50/p95/p99 latencies, queue depths, and token costs.
    """
    from app.core.telemetry import metrics_registry
    accept = request.headers.get("accept", "")
    if "text/plain" in accept:
        return Response(content=metrics_registry.to_prometheus_format(), media_type="text/plain")
    return metrics_registry.get_summary()


def start_server():
    """
    Starts the FastAPI server using Uvicorn driven by environment variables (ENG-5).
    Eliminates hardcoded reload and ports in production.
    """
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("RELOAD", "false" if IS_PRODUCTION else "true").lower() == "true"
    uvicorn.run("app.main:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    start_server()
