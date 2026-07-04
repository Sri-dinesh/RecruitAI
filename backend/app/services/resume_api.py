import httpx
import json
from typing import Optional
from app.core.config import APILAYER_API_KEY
from app.schemas.candidate_schema import Candidate
from app.core.llm_router import call_llm
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
        data = json.loads(response_text)
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
    Sends file bytes to APILayer CV Parser or falls back to local parsing.
    Maps response fields to Candidate.
    """
    extension = "." + filename.split(".")[-1].lower() if "." in filename else ".txt"
    
    # Extract raw text first in case we need it as fallback or context
    raw_text = ""
    try:
        if extension == ".pdf":
            raw_text = parse_pdf(file_bytes)
        elif extension == ".docx":
            raw_text = parse_docx(file_bytes)
        else:
            raw_text = file_bytes.decode("utf-8", errors="ignore").strip()
    except Exception as e:
        print(f"Local text extraction failed during API parsing: {e}")
        raw_text = "Empty Resume"

    if APILAYER_API_KEY and "your_apilayer" not in APILAYER_API_KEY.lower():
        try:
            headers = {"apikey": APILAYER_API_KEY}
            files = {"file": (filename, file_bytes, "application/octet-stream")}
            
            with httpx.Client() as client:
                response = client.post(
                    "https://api.apilayer.com/resume_parser/upload",
                    headers=headers,
                    files=files,
                    timeout=10.0
                )
                
            if response.status_code == 200:
                parsed_data = response.json()
                
                name = parsed_data.get("name")
                if not name and parsed_data.get("first_name"):
                    name = f"{parsed_data.get('first_name')} {parsed_data.get('last_name', '')}".strip()
                if not name:
                    name = filename.split(".")[0].replace("_", " ").title()
                    
                skills = parsed_data.get("skills", [])
                education = parsed_data.get("education", [])
                experience = parsed_data.get("experience", [])
                
                formatted_lines = [
                    f"Name: {name}",
                    f"Email: {parsed_data.get('email', 'N/A')}",
                    f"Phone: {parsed_data.get('phone', 'N/A')}",
                    "\nSkills:",
                    ", ".join(skills) if skills else "None listed",
                    "\nEducation:"
                ]
                
                for edu in education:
                    inst = edu.get("organization") or edu.get("school") or "Unknown Institution"
                    deg = edu.get("degree") or edu.get("field_of_study") or "Degree"
                    formatted_lines.append(f"- {deg} from {inst}")
                    
                formatted_lines.append("\nExperience:")
                for exp in experience:
                    company = exp.get("organization") or exp.get("company") or "Unknown Company"
                    title = exp.get("title") or "Role"
                    desc = exp.get("description") or ""
                    formatted_lines.append(f"- {title} at {company}\n  Description: {desc}")
                    
                structured_raw_text = "\n".join(formatted_lines)
                candidate_id = name.lower().replace(" ", "_")
                
                return Candidate(
                    candidate_id=candidate_id,
                    name=name,
                    raw_text=structured_raw_text
                )
            else:
                print(f"[APILayer] returned status {response.status_code}: {response.text}")
        except Exception as e:
            print(f"[APILayer] failed: {e}. Falling back to local/LLM parsing.")

    # Fallback to local parsing + LLM extraction
    return get_mock_parsed_resume(filename, raw_text)
