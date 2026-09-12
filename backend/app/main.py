import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes_chat import router as chat_router
from app.api.routes_reports import router as reports_router
from app.api.routes_ingest import router as ingest_router
from app.api.routes_evaluate import router as evaluate_router
from app.api.routes_analytics import router as analytics_router

import os

app = FastAPI(title="RecruitAI API Server", version="2.0")

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

@app.get("/api/health")
def read_health():
    return {"status": "ok", "message": "RecruitAI backend API server is running successfully."}

def start_server():
    """
    Starts the FastAPI server using Uvicorn.
    """
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

if __name__ == "__main__":
    start_server()
