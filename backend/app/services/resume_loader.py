import os
from pathlib import Path
from typing import List
from app.schemas.candidate_schema import Candidate

def load_resumes(directory_path: str) -> List[Candidate]:
    candidates = []
    dir_path = Path(directory_path)
    
    if not dir_path.exists() or not dir_path.is_dir():
        return candidates
        
    for file in dir_path.glob("*.txt"):
        with open(file, "r", encoding="utf-8") as f:
            raw_text = f.read()
            
        # Try to parse name from text, otherwise fallback to file name
        name = file.stem.replace("_", " ").title()
        for line in raw_text.splitlines():
            if line.strip().lower().startswith("name:"):
                name = line.split(":", 1)[1].strip()
                break
                
        candidate = Candidate(
            candidate_id=file.stem,
            name=name,
            raw_text=raw_text
        )
        candidates.append(candidate)
        
    return candidates
