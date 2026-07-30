import os
from pathlib import Path
from typing import List
from app.schemas.candidate_schema import Candidate
from app.services.document_parser import parse_document
from app.services.resume_parser import parse_structured_resume

def load_resumes(directory_path: str) -> List[Candidate]:
    candidates = []
    dir_path = Path(directory_path)
    
    if not dir_path.exists() or not dir_path.is_dir():
        return candidates
        
    supported_extensions = {".txt", ".pdf", ".docx"}
    for file in sorted(dir_path.iterdir()):
        if file.suffix.lower() not in supported_extensions:
            continue
            
        try:
            raw_text = parse_document(file)
            if not raw_text:
                continue
                
            candidate = parse_structured_resume(raw_text, filename=file.name)
            # Retain file stem as candidate_id if present for consistent IDs in tests/DB
            candidate.candidate_id = file.stem
            candidates.append(candidate)
        except Exception as e:
            print(f"Skipping resume file '{file.name}': {e}")
            
    return candidates

