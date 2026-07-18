import httpx
import json
from typing import Optional
from app.core.config import APILAYER_API_KEY
from app.schemas.candidate_schema import Candidate
from app.core.llm_router import call_llm, parse_json_safely
from app.services.document_parser import parse_pdf, parse_docx

def get_mock_parsed_resume(filename: str, raw_text: str) -> Candidate:
    """
    Mock parser fallback that parses raw resume text using LLM extraction
    to get structured candidate name and clean representation.
    """
    # Fallback default name
    name = filename.replace("_", " ").replace("-", " ").split(".")[0].title()
    
    # Try using LLM to extract candidate's actual name from raw_text
    system_instruction = (
        "You are an expert HR assistant. Extract the candidate's full name from the resume text. "
        "Return a JSON object: {\"name\": \"Candidate Name\"}. If name cannot be found, use the default."
    )
    prompt = f"Resume text:\n{raw_text[:2000]}\n\nDefault Name: {name}"
    
    try:
        response_text, _, _ = call_llm(
            prompt=prompt,
            system_instruction=system_instruction,
            json_mode=True
        )
        data = parse_json_safely(response_text)
        extracted_name = data.get("name", name)
    except Exception:
        extracted_name = name
        
    candidate_id = extracted_name.lower().replace(" ", "_")
    return Candidate(
        candidate_id=candidate_id,
        name=extracted_name,
        raw_text=raw_text
    )

def parse_resume_via_api(file_bytes: bytes, filename: str) -> Candidate:
    """
    Parses resume locally using pypdf/docx and LLM extraction, 
    completely avoiding external CV parser APIs to guarantee privacy.
    """
    extension = "." + filename.split(".")[-1].lower() if "." in filename else ".txt"
    
    # Extract raw text strictly using local libraries
    raw_text = ""
    try:
        if extension == ".pdf":
            raw_text = parse_pdf(file_bytes)
        elif extension == ".docx":
            raw_text = parse_docx(file_bytes)
        else:
            raw_text = file_bytes.decode("utf-8", errors="ignore").strip()
    except Exception as e:
        print(f"Local text extraction failed for {filename}: {e}")
        raw_text = "Empty Resume"

    # Route immediately to local LLM-assisted name extraction
    return get_mock_parsed_resume(filename, raw_text)
