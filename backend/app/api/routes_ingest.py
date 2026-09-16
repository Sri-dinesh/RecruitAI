from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Depends, Response, status
from typing import List, Optional, Dict, Any
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

def resolve_filename_and_ext(filename: str, content_type: str, file_bytes: bytes) -> tuple[str, str]:
    """
    Intelligently determines file extension from filename, Content-Type, or binary magic bytes.
    Guarantees that files uploaded from Android cache without explicit extensions are handled accurately.
    """
    ext = Path(filename).suffix.lower() if filename else ""
    if ext:
        return filename, ext

    content_type_map = {
        "application/pdf": ".pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "application/msword": ".docx",
        "text/plain": ".txt",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
    }
    inferred_ext = content_type_map.get((content_type or "").lower(), "")

    if not inferred_ext:
        if file_bytes.startswith(b"%PDF"):
            inferred_ext = ".pdf"
        elif file_bytes.startswith(b"PK\x03\x04"):
            inferred_ext = ".docx"
        elif file_bytes.startswith(b"\x89PNG"):
            inferred_ext = ".png"
        elif file_bytes.startswith(b"\xff\xd8\xff"):
            inferred_ext = ".jpg"
        else:
            inferred_ext = ".txt"

    base_name = filename.strip() if filename else "candidate_document"
    clean_name = f"{base_name}{inferred_ext}" if not base_name.endswith(inferred_ext) else base_name
    return clean_name, inferred_ext


@router.post("/ingest/upload")
async def upload_resumes_endpoint(
    response: Response,
    files: List[UploadFile] = File(default=[]),
    file: UploadFile = File(default=None),
    session_id: Optional[str] = Form(default=None),
    user_id: str = Depends(get_current_user_id)
):
    """
    POST endpoint to upload PDF, DOCX, or TXT candidate resumes.
    Implements partial-failure semantics with HTTP 207 Multi-Status (BUG-5).
    Extracts text, parses structured candidate fields with LLM,
    persists candidate entity scoped to campaign session, embeds chunks to public.resume_chunks.
    Accepts multiple files via 'files' or a single file via 'file' or 'files'.
    """
    upload_list = list(files)
    if file:
        upload_list.append(file)
    if not upload_list:
        raise HTTPException(status_code=400, detail="No resume files were provided.")

    results: List[Dict[str, Any]] = []
    has_success = False
    has_failure = False

    for f in upload_list:
        raw_name = f.filename or "resume.pdf"
        try:
            file_bytes = await f.read()
            filename, extension = resolve_filename_and_ext(raw_name, f.content_type or "", file_bytes)

            SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".txt", ".text", ".png", ".jpg", ".jpeg"]
            if extension not in SUPPORTED_EXTENSIONS:
                has_failure = True
                results.append({
                    "filename": raw_name,
                    "status": "failed",
                    "error": f"Unsupported file format '{extension}'. Supported formats: PDF, DOCX, TXT, PNG, JPG."
                })
                continue

            if len(file_bytes) > MAX_UPLOAD_SIZE:
                has_failure = True
                results.append({
                    "filename": raw_name,
                    "status": "failed",
                    "error": f"File '{filename}' exceeds maximum allowed size of 15 MB."
                })
                continue

            # 1. Parse resume
            candidate_parsed = parse_resume_via_api(file_bytes, filename)
            if not candidate_parsed.raw_text or candidate_parsed.raw_text == "Empty Resume":
                has_failure = True
                results.append({
                    "filename": raw_name,
                    "status": "failed",
                    "error": "No readable text could be extracted from the file."
                })
                continue

            # 2. Chunk, embed, and upload (scoped to campaign session with deterministic dedup)
            candidate = ingest_candidate_object(candidate_parsed, user_id, session_id=session_id)
            has_success = True
            item = candidate.model_dump()
            item.update({
                "filename": filename,
                "status": "success",
                "candidate_id": candidate.candidate_id,
                "name": candidate.name
            })
            results.append(item)

        except Exception as e:
            has_failure = True
            results.append({
                "filename": raw_name,
                "status": "failed",
                "error": f"Error ingesting '{raw_name}': {str(e)}"
            })

    # If single file and it failed, raise 400 for standard validation errors
    if len(upload_list) == 1 and has_failure and not has_success:
        raise HTTPException(status_code=400, detail=results[0].get("error", "Upload failed"))

    # If partial failure (or batch with failures), return RFC 4918 HTTP 207 Multi-Status
    if has_failure:
        response.status_code = status.HTTP_207_MULTI_STATUS
    else:
        response.status_code = status.HTTP_200_OK

    return results


@router.post("/ingest/upload-jd", response_model=JobDescription)
async def upload_jd_endpoint(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(default=None),
    user_id: str = Depends(get_current_user_id)
):
    """
    POST endpoint to upload PDF, DOCX, or TXT Job Descriptions.
    Extracts text, parses structured JD with LLM, persists to public.jobs,
    and binds to the specified campaign session.
    """
    raw_name = file.filename or "jd.pdf"
    file_bytes = await file.read()
    
    filename, extension = resolve_filename_and_ext(raw_name, file.content_type or "", file_bytes)
    
    SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".txt", ".text", ".png", ".jpg", ".jpeg"]
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{extension}'. Supported formats: PDF, DOCX, TXT, PNG, JPG."
        )
        
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
        save_job_description(parsed_jd, user_id=user_id, raw_text=raw_jd_text, session_id=session_id)
        return parsed_jd
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse JD: {str(e)}")
