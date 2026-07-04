from fastapi import APIRouter, File, UploadFile, HTTPException
from typing import List
from pathlib import Path

from app.schemas.candidate_schema import Candidate
from app.services.ingestion_service import ingest_single_candidate_text
from app.services.resume_api import parse_resume_via_api

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
