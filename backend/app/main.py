import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes_chat import router as chat_router
from app.api.routes_reports import router as reports_router
from app.api.routes_ingest import router as ingest_router

app = FastAPI(title="RecruitAI API Server", version="2.0")

# Enable CORS to allow connections from Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(chat_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(ingest_router, prefix="/api")

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
