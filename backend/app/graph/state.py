from typing import TypedDict, List, Optional
from app.schemas.jd_schema import JobDescription
from app.schemas.candidate_schema import Candidate

class RecruitState(TypedDict):
    jd_structured: Optional[JobDescription]
    resumes: List[Candidate]
    conversation_history: List[dict]        # {role, content, timestamp}
    last_shortlist: Optional[List[Candidate]]
    pending_confirmation: Optional[dict]
    last_intent: Optional[str]
