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
    "finalize_shortlist": "finalizing the candidate shortlist",
    "compare": "comparing candidates side-by-side in a table",
    "email": "drafting or sending a recruiter email to a candidate",
    "trend": "analyzing trending skills and market demand for a role",
    "schedule": "scheduling or booking an interview time slot",
    "redflags": "detecting red flags, timeline gaps, or inconsistencies in resumes",
    "fetch_jd_api": "fetching job descriptions from live APIs"
}

def rule_based_classify(query: str) -> Optional[Tuple[str, float]]:
    """
    Performs quick regex-based classification for high-confidence intents.
    Returns (intent, confidence) or None if no match.
    """
    q = query.lower().strip()
    
    # 0. Numeric Selection mappings (from fallback option lists)
    num_query = q.strip(".")
    if num_query in ["1", "one"]:
        return "load_context", 1.0
    if num_query in ["2", "two"]:
        return "count", 1.0
    if num_query in ["3", "three"]:
        return "screen", 1.0
    if num_query in ["4", "four"]:
        return "rewrite_jd", 1.0
    if num_query in ["5", "five"]:
        return "interview_questions", 1.0
    if num_query in ["6", "six"]:
        return "salary", 1.0
    if num_query in ["7", "seven"]:
        return "finalize_shortlist", 1.0

    # 1. load_context check
    if re.search(r"\b(load|parse|read|ingest|import)\b.*\b(jd|job description|resume|cv|candidate|resumes|context)\b", q) or re.search(r"\b(jd|job description|resume|cv|candidate|resumes|context)\b.*\b(load|parse|read|ingest|import)\b", q):
        return "load_context", 1.0

    # 2. count check
    if re.search(r"\b(how many|count of|number of|how many (candidates|resumes|applicants))\b", q):
        return "count", 1.0

    # 3. screen check
    if re.search(r"\b(screen|rank|evaluate|find top|get top|top candidate|filter|match)\b.*\b(candidate|resume|applicant|resumes)\b", q) or re.search(r"\b(candidate|resume|applicant|resumes)\b.*\b(screen|rank|evaluate|find top|get top|top candidate|filter|match)\b", q) or q in ["screen", "screen candidates", "rank candidates"]:
        return "screen", 1.0

    # 4. finalize_shortlist check
    if re.search(r"\b(finalize|lock in|go with these|finalize shortlist)\b", q):
        return "finalize_shortlist", 1.0

    # 5. compare check
    if re.search(r"\b(compare|side.by.side|vs|versus)\b", q):
        return "compare", 1.0

    # 6. email/outreach check
    if re.search(r"\b(email|draft|send email|write email|outreach)\b", q):
        return "email", 1.0

    # 7. skill trend check
    if re.search(r"\b(trend|trending|in.demand|market skill|skill trend)\b", q):
        return "trend", 1.0

    # 8. schedule/calendar check
    if re.search(r"\b(schedule|calendar|book|interview time|slot)\b", q):
        return "schedule", 1.0

    # 9. red flags check
    if re.search(r"\b(red flag|gap|inconsistent|suspicious|resume issue)\b", q):
        return "redflags", 1.0

    # 10. fetch live jd check
    if re.search(r"\b(fetch|get|pull|search|benchmark)\b.*\b(jd|job description|jobs)\b.*\b(api|internet|web|online|live|indianapi|serpapi)\b", q) or re.search(r"\b(api|internet|web|online|live|indianapi|serpapi)\b.*\b(fetch|get|pull|search|benchmark)\b.*\b(jd|job description|jobs)\b", q):
        return "fetch_jd_api", 1.0

    # 11. rewrite_jd check
    if re.search(r"\b(rewrite|polish|improve|startup tone)\b.*\b(jd|job description|role)\b", q) or re.search(r"\b(jd|job description)\b.*\b(rewrite|polish|improve|startup tone)\b", q):
        return "rewrite_jd", 1.0

    # 12. interview_questions check
    if re.search(r"\b(interview|prep|preparation|practice)\b.*\b(question|questions|prep)\b", q) or re.search(r"\b(question|questions)\b.*\b(interview|prep|candidate)\b", q):
        return "interview_questions", 1.0

    # 13. simple greeting or fallback check
    if q in ["hi", "hello", "hey", "who are you", "help"]:
        return "other", 1.0

    return None

def llm_classify(query: str, state: Optional[RecruitState] = None) -> Tuple[str, float, str, float]:
    """
    Calls LLM to classify the intent of the query.
    Returns (intent, confidence, provider, latency_ms).
    """
    context = ""
    if state:
        jd = state.get("jd_structured")
        resumes = state.get("resumes", [])
        history = state.get("conversation_history", [])
        
        context = "Current Application State:\n"
        if jd:
            context += f"- Active JD Role: {jd.role}\n"
        if resumes:
            context += f"- Loaded Candidates: {', '.join([c.name for c in resumes])}\n"
        context += "\n"
        
        if len(history) > 1:
            context += "Recent conversation history:\n"
            for msg in history[-4:-1]:
                context += f"{msg['role'].upper()}: {msg['content']}\n"
            context += "\n"

    system_instruction = (
        "You are the routing and classification node for a recruitment agent. "
        "Classify the user's query into one of the following intents:\n"
        "- load_context: Ingest or load a job description (JD) or candidate resumes (e.g. 'here is the JD', 'load resumes')\n"
        "- screen: Rank/evaluate candidates against the JD (e.g. 'who matches best', 'rank applicants', 'screen candidates')\n"
        "- rewrite_jd: Rewrite or edit the JD (e.g. 'rewrite this JD for a startup', 'shorten the job description')\n"
        "- interview_questions: Generate prep questions for a candidate (e.g. 'interview questions for Alice', 'prep questions for the top candidate')\n"
        "- salary: Get salary market benchmarks (e.g. 'what is the salary for this role', 'salary range in India')\n"
        "- compare: Compare candidates side-by-side in a table (e.g. 'compare top candidates', 'show me a comparison table')\n"
        "- email: Draft or send a recruiter email (e.g. 'draft an interview invite for Alice', 'write a rejection email for Bob')\n"
        "- trend: Analyze trending skills or market demand (e.g. 'what skills are trending for Python developers', 'skill trends for this role')\n"
        "- schedule: Schedule or book an interview slot (e.g. 'schedule an interview with Alice', 'book a meeting with the top candidate')\n"
        "- redflags: Detect red flags or issues in resumes (e.g. 'check for red flags', 'any gaps in resumes', 'resume issues')\n"
        "- fetch_jd_api: Fetch live job descriptions from external APIs (e.g. 'fetch JD for Frontend Developer via API', 'get job description for python from internet')\n"
        "- other: Greetings, chit-chat, clarify, or unclassified queries.\n\n"
        "Return a JSON object: {\"intent\": \"<intent>\", \"confidence\": <float_0_to_1>}."
    )

    prompt = (
        f"{context}"
        f"User Query: \"{query}\"\n\n"
        "JSON Response:"
    )

    valid_intents = [
        "load_context", "screen", "rewrite_jd", "interview_questions", "salary",
        "compare", "email", "trend", "schedule", "redflags", "fetch_jd_api", "other"
    ]

    try:
        from app.core.llm_router import call_llm, parse_json_safely
        response_text, provider, latency_ms = call_llm(
            prompt=prompt,
            system_instruction=system_instruction,
            json_mode=True
        )
        data = parse_json_safely(response_text)
        intent = data.get("intent", "other")
        confidence = float(data.get("confidence", 0.5))

        if intent not in valid_intents:
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
    intent, confidence, provider, latency_ms = llm_classify(query, state)
    log_event(intent, confidence, provider, latency_ms, "router_node")
    
    # Step 3: Handle low confidence
    if confidence < 0.6:
        # Instead of routing to the intent, route to 'other' so fallback handler can clarify
        return "other", confidence, None
        
    # Step 4: Resolve candidate references
    resolved_candidate = resolve_candidate_reference(query, state)
    
    return intent, confidence, resolved_candidate
