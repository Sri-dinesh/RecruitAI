from pydantic import BaseModel
from typing import Optional, List

class Candidate(BaseModel):
    candidate_id: str = ""
    name: str = "Candidate"
    raw_text: Optional[str] = ""
    match_score: Optional[float] = None
    matched_skills: Optional[List[str]] = None
    gaps: Optional[List[str]] = None
    experience_years: Optional[float] = None
    red_flags: Optional[List[str]] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    headline: Optional[str] = None
    summary: Optional[str] = None
    skills: List[str] = []
    work_experience: List[str] = []
    education: List[str] = []
    certifications: List[str] = []
    links: List[str] = []
    languages: List[str] = []
