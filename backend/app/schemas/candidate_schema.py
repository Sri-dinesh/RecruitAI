from pydantic import BaseModel
from typing import Optional, List

class Candidate(BaseModel):
    candidate_id: str
    name: str
    raw_text: str
    match_score: Optional[float] = None
    matched_skills: Optional[List[str]] = None
    gaps: Optional[List[str]] = None
