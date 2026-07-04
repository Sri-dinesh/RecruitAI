import re
import json
import time
from typing import Dict, Any, Tuple, Optional
from app.graph.state import RecruitState
from app.core.llm_router import call_llm
from app.core.logging import log_event, increment_turn

INTENT_PLAIN_MAP = {
    "load_context": "loading job descriptions or candidate resumes",
    "screen": "screening and ranking candidates",
    "rewrite_jd": "rewriting or polishing the job description",
    "interview_questions": "generating interview questions",
    "salary": "benchmarking market salary data",
    "finalize_shortlist": "finalizing the candidate shortlist"
}

def rule_based_classify(query: str) -> Optional[Tuple[str, float]]:
    """
    Performs quick regex-based classification for high-confidence intents.
    Returns (intent, confidence) or None if no match.
    """
    q = query.lower().strip()
    
    # 1. count check
    if re.search(r"\b(how many|count of|number of|how many (candidates|resumes|applicants))\b", q):
        return "count", 1.0
        
    # 2. finalize_shortlist check
    if re.search(r"\b(finalize|lock in|go with these|finalize shortlist)\b", q):
        return "finalize_shortlist", 1.0
        
    # 3. simple greeting or fallback check
    if q in ["hi", "hello", "hey", "who are you", "help"]:
        return "other", 1.0
        
    return None

def llm_classify(query: str) -> Tuple[str, float, str, float]:
    """
    Calls LLM to classify the intent of the query.
    Returns (intent, confidence, provider, latency_ms).
    """
    system_instruction = (
        "You are the routing and classification node for a recruitment agent. "
        "Classify the user's query into one of the following intents:\n"
        "- load_context: Ingest or load a job description (JD) or candidate resumes (e.g. 'here is the JD', 'load resumes')\n"
        "- screen: Rank/evaluate candidates against the JD (e.g. 'who matches best', 'rank applicants', 'screen candidates')\n"
        "- rewrite_jd: Rewrite or edit the JD (e.g. 'rewrite this JD for a startup', 'shorten the job description')\n"
        "- interview_questions: Generate prep questions for a candidate (e.g. 'interview questions for Alice', 'prep questions for the top candidate')\n"
        "- salary: Get salary market benchmarks (e.g. 'what is the salary for this role', 'salary range in India')\n"
        "- other: Greetings, chit-chat, clarify, or unclassified queries.\n\n"
        "Return a JSON object: {\"intent\": \"<intent>\", \"confidence\": <float_0_to_1>}."
    )
    
    prompt = f"User Query: \"{query}\"\n\nJSON Response:"
    
    try:
        response_text, provider, latency_ms = call_llm(
            prompt=prompt,
            system_instruction=system_instruction,
            json_mode=True
        )
        
        # Parse JSON output
        data = json.loads(response_text.strip())
        intent = data.get("intent", "other")
        confidence = float(data.get("confidence", 0.5))
        
        if intent not in ["load_context", "screen", "rewrite_jd", "interview_questions", "salary", "other"]:
            intent = "other"
            
        return intent, confidence, provider, latency_ms
    except Exception as e:
        print(f"Router LLM classification failed: {str(e)}")
        return "other", 0.5, "none", 0.0

def resolve_candidate_reference(query: str, state: RecruitState) -> Optional[str]:
    """
    Deterministically resolves candidate references like "the top candidate", "her", or names
    against the last shortlist or loaded resumes.
    Returns candidate_id if resolved, or None.
    """
    q = query.lower()
    last_shortlist = state.get("last_shortlist")
    all_resumes = state.get("resumes", [])
    
    # 1. Check for explicit name mentions
    for candidate in all_resumes:
        # Check if first name or full name is mentioned
        first_name = candidate.name.split()[0].lower()
        full_name = candidate.name.lower()
        if re.search(rf"\b{re.escape(first_name)}\b", q) or re.search(rf"\b{re.escape(full_name)}\b", q):
            return candidate.candidate_id
            
    # 2. Check for ordinal mentions in the shortlist
    if last_shortlist:
        if re.search(r"\b(top candidate|first candidate|best match|first one|number one|no\.? 1)\b", q):
            return last_shortlist[0].candidate_id
        if len(last_shortlist) > 1 and re.search(r"\b(second candidate|second one|runner up|no\.? 2)\b", q):
            return last_shortlist[1].candidate_id
        if len(last_shortlist) > 2 and re.search(r"\b(third candidate|third one|no\.? 3)\b", q):
            return last_shortlist[2].candidate_id
            
    # 3. Handle pronouns if there's only one in the last shortlist or resumes
    # In a real app we might use LLM, but here we keep it simple or fallback to None
    return None

def route_and_log(query: str, state: RecruitState) -> Tuple[str, float, Optional[str]]:
    """
    Orchestrates the routing process:
    1. Pre-checks rule-based patterns
    2. Runs LLM classification fallback
    3. Handles confidence threshold (< 0.6)
    4. Resolves candidate references
    5. Logs the routing event
    Returns (intent, confidence, resolved_candidate_id).
    """
    # Increment global turn
    increment_turn()
    
    # Step 1: Rule-based checks
    rule_result = rule_based_classify(query)
    if rule_result:
        intent, confidence = rule_result
        log_event(intent, confidence, "rules", 0.0, "router_node")
        # Try resolving candidate references if applicable
        resolved_candidate = resolve_candidate_reference(query, state)
        return intent, confidence, resolved_candidate
        
    # Step 2: LLM Classification
    intent, confidence, provider, latency_ms = llm_classify(query)
    log_event(intent, confidence, provider, latency_ms, "router_node")
    
    # Step 3: Handle low confidence
    if confidence < 0.6:
        # Instead of routing to the intent, route to 'other' so fallback handler can clarify
        return "other", confidence, None
        
    # Step 4: Resolve candidate references
    resolved_candidate = resolve_candidate_reference(query, state)
    
    return intent, confidence, resolved_candidate
