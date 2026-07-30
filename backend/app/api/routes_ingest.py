from fastapi import APIRouter, File, UploadFile, HTTPException
from typing import List
from pathlib import Path
import json

from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription
from app.services.ingestion_service import ingest_single_candidate_text
from app.services.resume_api import parse_resume_via_api
from app.services.document_parser import parse_document
from app.core.llm_router import call_llm, parse_json_safely

router = APIRouter()

@router.post("/ingest/upload", response_model=List[Candidate])
async def upload_resumes_endpoint(files: List[UploadFile] = File(...)):
    """
    POST endpoint to upload PDF, DOCX, or TXT candidate resumes.
    Integrates live resume parsing API (APILayer Resume Parser) and falls back
    to local PDF/DOCX/TXT extraction.
    Generates embeddings and upserts them to Supabase.
    """
    ingested_candidates = []
    
    for file in files:
        filename = file.filename or "unknown_candidate.txt"
        file_path = Path(filename)
        extension = file_path.suffix.lower()
        
        if extension not in [".pdf", ".docx", ".txt", ".text"]:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format '{extension}'. Only PDF, DOCX, and TXT are supported."
            )
            
        # Read file bytes
        file_bytes = await file.read()
        
        try:
            # 1. Parse resume using the APILayer CV Parser or fallback
            candidate_parsed = parse_resume_via_api(file_bytes, filename)
            
            if not candidate_parsed.raw_text or candidate_parsed.raw_text == "Empty Resume":
                raise ValueError("No text content could be extracted from the file.")
                
            # 2. Chunk, embed, and upload using ingestion service
            candidate = ingest_single_candidate_text(
                candidate_parsed.candidate_id,
                candidate_parsed.name,
                candidate_parsed.raw_text
            )
            ingested_candidates.append(candidate)
            
        except HTTPException as http_err:
            raise http_err
        except ValueError as val_err:
            raise HTTPException(status_code=400, detail=f"Parsing error in '{filename}': {str(val_err)}")
        except Exception as e:
            print(f"Error ingesting uploaded resume '{filename}': {e}")
            raise HTTPException(status_code=500, detail=f"Internal error ingesting '{filename}': {str(e)}")
            
    return ingested_candidates


@router.post("/ingest/upload-jd", response_model=JobDescription)
async def upload_jd_endpoint(file: UploadFile = File(...)):
    """
    POST endpoint to upload PDF, DOCX, or TXT Job Descriptions.
    Extracts text, parses it via LLM, and returns structured JobDescription.
    """
    filename = file.filename or "jd.txt"
    extension = Path(filename).suffix.lower()
    
    if extension not in [".pdf", ".docx", ".txt", ".text"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{extension}'. Only PDF, DOCX, and TXT are supported."
        )
        
    file_bytes = await file.read()
    raw_jd_text = ""
    
    try:
        # Resolve text extraction based on file format via parse_document
        raw_jd_text = parse_document(file_bytes, filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file content: {str(e)}")
        
    if not raw_jd_text.strip():
        raise HTTPException(status_code=400, detail="The uploaded JD file is empty.")
        
    # Parse JD text into structured JobDescription model with full fallback & alias support
    try:
        from app.services.jd_parser import parse_structured_jd
        return parse_structured_jd(raw_jd_text, filename, llm_func=call_llm)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse JD: {str(e)}")
