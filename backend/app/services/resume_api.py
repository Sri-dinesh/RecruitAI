from app.schemas.candidate_schema import Candidate
from app.core.llm_router import call_llm
from app.services.document_parser import parse_document
from app.services.resume_parser import parse_structured_resume

def get_mock_parsed_resume(filename: str, raw_text: str) -> Candidate:
    """
    Parses raw resume text using structured resume parser to get candidate details.
    """
    return parse_structured_resume(raw_text, filename, llm_func=call_llm)

def parse_resume_via_api(file_bytes: bytes, filename: str) -> Candidate:
    """
    Parses resume using document_parser and structured LLM extraction.
    """
    try:
        raw_text = parse_document(file_bytes, filename)
    except Exception as e:
        print(f"Local text extraction failed for {filename}: {e}")
        raw_text = "Empty Resume"

    return parse_structured_resume(raw_text, filename, llm_func=call_llm)

