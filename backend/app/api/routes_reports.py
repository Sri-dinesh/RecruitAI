from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import io
from app.services.report_generator import generate_recruitment_report

router = APIRouter()

class ReportRequest(BaseModel):
    jd: Optional[Dict[str, Any]] = None
    shortlist: List[Dict[str, Any]] = []
    interview_questions: str = ""
    salary_data: str = ""

@router.post("/reports/generate")
async def generate_report_endpoint(req: ReportRequest):
    """
    Exposes a POST route to generate a styled corporate recruitment PDF report.
    """
    try:
        jd_data = req.jd or {}
        shortlist_data = req.shortlist
        questions = req.interview_questions
        salary = req.salary_data
        
        # Generate the ReportLab PDF
        pdf_bytes = generate_recruitment_report(jd_data, shortlist_data, questions, salary)
        
        # Stream the PDF back for download
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=recruitment_report.pdf",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        print(f"Error in FastAPI report generation: {e}")
        raise HTTPException(status_code=500, detail=str(e))
