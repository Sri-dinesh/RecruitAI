from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from typing import List
from pathlib import Path
import json

from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription
from app.services.ingestion_service import (
    ingest_candidate_object,
    save_job_description,
    ingest_single_candidate_text,
)
from app.services.resume_api import parse_resume_via_api
from app.services.document_parser import parse_document
from app.core.llm_router import call_llm
from app.core.auth import get_current_user_id

router = APIRouter()

MAX_UPLOAD_SIZE = 15 * 1024 * 1024  # 15 MB per file

@router.post("/ingest/upload", response_model=List[Candidate])
async def upload_resumes_endpoint(
    files: List[UploadFile] = File(default=[]),
    file: UploadFile = File(default=None),
    user_id: str = Depends(get_current_user_id)
):
    """
    POST endpoint to upload PDF, DOCX, or TXT candidate resumes.
    Extracts text, parses structured candidate fields with LLM,
    persists candidate entity to public.candidates, embeds chunks to public.resume_chunks.
    Accepts multiple files via 'files' or a single file via 'file' or 'files'.
    """
    upload_list = list(files)
    if file:
        upload_list.append(file)
    if not upload_list:
        raise HTTPException(status_code=400, detail="No resume files were provided.")
        
    ingested_candidates = []
    
    for f in upload_list:
        filename = f.filename or "unknown_candidate.txt"
        file_path = Path(filename)
        extension = file_path.suffix.lower()
        
        SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".text", ".png", ".jpg", ".jpeg"]
        if extension not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format '{extension}'. Supported formats: PDF, DOCX, TXT, PNG, JPG."
            )
            
        file_bytes = await f.read()
        if len(file_bytes) > MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File '{filename}' exceeds maximum allowed size of 15 MB."
            )
        
        try:
            # 1. Parse resume
            candidate_parsed = parse_resume_via_api(file_bytes, filename)
            
            if not candidate_parsed.raw_text or candidate_parsed.raw_text == "Empty Resume":
                raise ValueError("No readable text could be extracted from the file.")
                
            # 2. Chunk, embed, and upload
            candidate = ingest_candidate_object(candidate_parsed, user_id)
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
async def upload_jd_endpoint(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id)
):
    """
    POST endpoint to upload PDF, DOCX, or TXT Job Descriptions.
    Extracts text, parses structured JD with LLM, and persists to public.jobs.
    """
    filename = file.filename or "jd.txt"
    extension = Path(filename).suffix.lower()
    
    SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".text", ".png", ".jpg", ".jpeg"]
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{extension}'. Supported formats: PDF, DOCX, TXT, PNG, JPG."
        )
        
    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File '{filename}' exceeds maximum allowed size of 15 MB."
        )
    raw_jd_text = ""
    
    try:
        raw_jd_text = parse_document(file_bytes, filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file content: {str(e)}")
        
    if not raw_jd_text.strip():
        raise HTTPException(status_code=400, detail="The uploaded JD file is empty.")
        
    try:
        from app.services.jd_parser import parse_structured_jd
        parsed_jd = parse_structured_jd(raw_jd_text, filename, llm_func=call_llm)
        save_job_description(parsed_jd, user_id=user_id, raw_text=raw_jd_text)
        return parsed_jd
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse JD: {str(e)}")
