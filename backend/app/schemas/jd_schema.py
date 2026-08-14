from pydantic import BaseModel
from typing import Optional, List

class JobDescription(BaseModel):
    role: str = ""
    required_skills: List[str] = []
    experience_years: int = 0
    raw_text: Optional[str] = ""
    tone: Optional[str] = "professional"
    company_name: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    salary_range: Optional[str] = None
    education_requirements: Optional[str] = None
    preferred_skills: List[str] = []
    responsibilities: List[str] = []
    qualifications: List[str] = []
    benefits: List[str] = []
    industry: Optional[str] = None
    summary: Optional[str] = None
