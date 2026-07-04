from fastapi import APIRouter, File, UploadFile, HTTPException
from typing import List
from pathlib import Path
import io
import pypdf
import docx

from app.schemas.candidate_schema import Candidate
from app.services.ingestion_service import ingest_single_candidate_text

router = APIRouter()

def parse_pdf(file_bytes: bytes) -> str:
    """
    Extracts plain text from PDF bytes using pypdf.
    """
    try:
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text.strip()
    except Exception as e:
        raise ValueError(f"Failed to parse PDF file: {e}")

def parse_docx(file_bytes: bytes) -> str:
    """
    Extracts plain text from DOCX bytes using python-docx.
    """
    try:
        doc = docx.Document(io.BytesIO(file_bytes))
        paragraphs_text = [p.text for p in doc.paragraphs if p.text]
        return "\n".join(paragraphs_text).strip()
    except Exception as e:
        raise ValueError(f"Failed to parse DOCX file: {e}")

@router.post("/ingest/upload", response_model=List[Candidate])
async def upload_resumes_endpoint(files: List[UploadFile] = File(...)):
    """
    POST endpoint to upload PDF, DOCX, or TXT candidate resumes.
    Parses documents, generates embeddings, and upserts them to Supabase.
    """
    ingested_candidates = []
    
    for file in files:
        filename = file.filename or "unknown_candidate.txt"
        file_path = Path(filename)
        extension = file_path.suffix.lower()
        
        # Read file bytes
        file_bytes = await file.read()
        
        try:
            # 1. Parse text based on file format
            if extension == ".pdf":
                text = parse_pdf(file_bytes)
            elif extension == ".docx":
                text = parse_docx(file_bytes)
            elif extension in [".txt", ".text"]:
                text = file_bytes.decode("utf-8", errors="ignore").strip()
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file format '{extension}'. Only PDF, DOCX, and TXT are supported."
                )
                
            if not text:
                raise ValueError("No text content could be extracted from the file.")
                
            # 2. Resolve Candidate Name and ID
            # e.g., "Alice_Smith.pdf" -> name="Alice Smith", candidate_id="alice_smith"
            name = file_path.stem.replace("_", " ").replace("-", " ").strip()
            # Title case candidate name
            name = " ".join([word.capitalize() for word in name.split()])
            candidate_id = name.lower().replace(" ", "_")
            
            # 3. Chunk, embed, and upload using ingestion service
            candidate = ingest_single_candidate_text(candidate_id, name, text)
            ingested_candidates.append(candidate)
            
        except HTTPException as http_err:
            raise http_err
        except ValueError as val_err:
            raise HTTPException(status_code=400, detail=f"Parsing error in '{filename}': {str(val_err)}")
        except Exception as e:
            print(f"Error ingesting uploaded resume '{filename}': {e}")
            raise HTTPException(status_code=500, detail=f"Internal error ingesting '{filename}': {str(e)}")
            
    return ingested_candidates
