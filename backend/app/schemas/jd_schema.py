from pydantic import BaseModel
from typing import Optional, List

class JobDescription(BaseModel):
    role: str
    required_skills: List[str]
    experience_years: int
    raw_text: str
    tone: Optional[str] = None
