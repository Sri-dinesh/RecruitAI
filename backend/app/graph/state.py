from typing import TypedDict, List, Optional
from app.schemas.jd_schema import JobDescription
from app.schemas.candidate_schema import Candidate

class RecruitState(TypedDict, total=False):
    jd_structured: Optional[JobDescription]
    resumes: List[Candidate]
    conversation_history: List[dict]        # {role, content, timestamp}
    last_shortlist: Optional[List[Candidate]]
    pending_confirmation: Optional[dict]
    last_intent: Optional[str]
    scheduled_interviews: Optional[List[dict]]  # {candidate_name, slot, booked_at}
    user_id: Optional[str]
    # Conversational entity memory: candidate(s) in focus, resolved fresh
    # each turn from explicit references, focused_candidate_id, and history.
    active_candidate_id: Optional[str]
    active_candidate_ids: Optional[List[str]]
    # Client-provided focus (e.g. open inspector / @-mention). Highest priority
    # after explicit in-message references.
    focused_candidate_id: Optional[str]
