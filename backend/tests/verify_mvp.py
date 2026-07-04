import sys
import json
from pathlib import Path
from unittest.mock import patch

# Add backend/ to Python path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.graph.builder import graph
from app.graph.state import RecruitState
from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription

# Mock responses for call_llm
mock_llm_responses = {
    # Router classification responses for LLM turns
    "route_load": (
        '{"intent": "load_context", "confidence": 0.95}',
        "gemini",
        100.0
    ),
    "route_screen": (
        '{"intent": "screen", "confidence": 0.95}',
        "groq",
        100.0
    ),
    "route_rewrite": (
        '{"intent": "rewrite_jd", "confidence": 0.92}',
        "gemini",
        90.0
    ),
    "route_interview": (
        '{"intent": "interview_questions", "confidence": 0.98}',
        "groq",
        110.0
    ),
    "route_salary": (
        '{"intent": "salary", "confidence": 0.94}',
        "gemini",
        85.0
    ),
    # JD Parsing (Turn 1)
    "parse_jd": (
        '{"role": "Senior Full Stack Engineer", '
        '"required_skills": ["Python", "React", "Node.js", "PostgreSQL", "AWS", "TypeScript"], '
        '"experience_years": 5}',
        "gemini",
        150.0
    ),
    # Screening evaluation (Turn 3)
    "screen_eval": (
        '{\n'
        '  "evaluations": [\n'
        '    {"candidate_id": "alice_smith", "match_score": 95.0, "matched_skills": ["Python", "React", "Node.js", "PostgreSQL", "AWS", "TypeScript"], "gaps": [], "reasoning": "Strong match with all required skills."},\n'
        '    {"candidate_id": "bob_jones", "match_score": 85.0, "matched_skills": ["Python", "React", "PostgreSQL", "AWS"], "gaps": ["Node.js", "TypeScript"], "reasoning": "Solid Python/React experience but missing Node/TS."},\n'
        '    {"candidate_id": "fiona_gallagher", "match_score": 60.0, "matched_skills": ["React", "Node.js", "PostgreSQL"], "gaps": ["Python", "AWS", "TypeScript"], "reasoning": "Has React and Node.js but lacks Python and AWS."}\n'
        '  ]\n'
        '}',
        "groq",
        800.0
    ),
    # JD rewrite (Turn 4)
    "rewrite_jd": (
        "### Senior Full Stack Engineer (Startup Edition)\n\n"
        "We are looking for a rockstar developer with 5+ years experience. "
        "Must kick butt with **Python**, **React**, **Node.js**, **PostgreSQL**, and **AWS**.",
        "gemini",
        450.0
    ),
    # Interview prep questions (Turn 9)
    "interview_qs": (
        "1. **Technical**: In your React projects, how do you optimize re-rendering with TypeScript?\n"
        "2. **Backend**: Describe a complex database schema optimization you performed in PostgreSQL.\n"
        "3. **Behavioral**: Tell us about a time you led a cloud migration on AWS under a tight deadline.\n"
        "4. **Gaps**: How do you approach picking up new backend frameworks like Node.js?",
        "groq",
        350.0
    )
}

# Ingestion mock return value
mock_candidates = [
    Candidate(candidate_id="alice_smith", name="Alice Smith", raw_text="Alice's resume..."),
    Candidate(candidate_id="bob_jones", name="Bob Jones", raw_text="Bob's resume..."),
    Candidate(candidate_id="fiona_gallagher", name="Fiona Gallagher", raw_text="Fiona's resume...")
]

def custom_call_llm(prompt, system_instruction=None, json_mode=False, **kwargs):
    prompt_lower = prompt.lower()
    
    # 1. Router classification mapping
    if "classify the user's query" in (system_instruction or "").lower():
        if "load" in prompt_lower or "ingest" in prompt_lower:
            return mock_llm_responses["route_load"]
        elif "who is the best match" in prompt_lower or "screen" in prompt_lower:
            return mock_llm_responses["route_screen"]
        elif "rewrite" in prompt_lower:
            return mock_llm_responses["route_rewrite"]
        elif "interview questions" in prompt_lower or "prep questions" in prompt_lower:
            return mock_llm_responses["route_interview"]
        elif "salary" in prompt_lower:
            return mock_llm_responses["route_salary"]
        else:
            return '{"intent": "other", "confidence": 0.50}', "mock_provider", 10.0
            
    # 2. Main handler nodes mapping
    if "<job_description>" in prompt:
        return mock_llm_responses["parse_jd"]
    elif "evaluate the following candidates" in prompt:
        return mock_llm_responses["screen_eval"]
    elif "rewrite this job description" in prompt:
        return mock_llm_responses["rewrite_jd"]
    elif "generate 5-7 interview prep questions" in prompt:
        return mock_llm_responses["interview_qs"]
        
    if json_mode:
        return '{"intent": "other", "confidence": 0.50}', "mock_provider", 10.0
    return "Mock response", "mock_provider", 10.0

# Mock DB query top-k
def mock_query_top_k(*args, **kwargs):
    return [
        {"chunk_text": "Experienced building web applications with React, Node.js and PostgreSQL.", "candidate_name": "Alice Smith", "similarity": 0.85},
        {"chunk_text": "Strong background in Python API design and cloud deployment on AWS.", "candidate_name": "Alice Smith", "similarity": 0.82}
    ]

# Setup multi-patching context managers
patches = [
    # call_llm patches
    patch("app.graph.router_node.call_llm", side_effect=custom_call_llm),
    patch("app.graph.nodes.parse_jd_node.call_llm", side_effect=custom_call_llm),
    patch("app.graph.nodes.screen_node.call_llm", side_effect=custom_call_llm),
    patch("app.graph.nodes.jd_rewrite_node.call_llm", side_effect=custom_call_llm),
    patch("app.graph.nodes.interview_qgen_node.call_llm", side_effect=custom_call_llm),
    
    # Ingestion pipeline patches
    patch("app.services.ingestion_service.load_resumes", return_value=mock_candidates),
    patch("app.services.ingestion_service.clear_all_chunks", return_value=None),
    patch("app.services.ingestion_service.upsert_chunks", return_value=None),
    patch("app.services.ingestion_service.embed_texts", return_value=[[0.1]*384 for _ in range(10)]),
    
    # Vector store / Embeddings patches for nodes
    patch("app.graph.nodes.screen_node.embed_text", return_value=[0.1]*384),
    patch("app.graph.nodes.screen_node.query_top_k", side_effect=mock_query_top_k),
    patch("app.graph.nodes.interview_qgen_node.embed_text", return_value=[0.1]*384),
    patch("app.graph.nodes.interview_qgen_node.query_top_k", side_effect=mock_query_top_k)
]

def run_simulation():
    # Activate all patches
    for p in patches:
        p.start()
        
    try:
        # Initialize state
        state: RecruitState = {
            "jd_structured": None,
            "resumes": [],
            "conversation_history": [],
            "last_shortlist": None,
            "pending_confirmation": None,
            "last_intent": None
        }
        
        turns = [
            # Turn 1: Load JD and resumes (parse_jd_node)
            "Load job description backend/data/jds/senior_fullstack_engineer.txt and resumes from backend/data/resumes",
            
            # Turn 2: Count candidates (count_node - rule based, no LLM)
            "How many candidates do we have?",
            
            # Turn 3: Screen candidates (screen_node)
            "Who is the best match for the role?",
            
            # Turn 4: JD Rewrite startup tone (jd_rewrite_node)
            "Rewrite the job description to match a startup tone",
            
            # Turn 5: HITL Reject the rewrite (hitl_confirm_node)
            "no",
            
            # Turn 6: Finalize Shortlist (hitl_confirm_node initiation)
            "Finalize the shortlist now",
            
            # Turn 7: HITL Edit shortlist (hitl_confirm_node exclusion check)
            "remove bob",
            
            # Turn 8: HITL Confirm the shortlist (hitl_confirm_node finalize)
            "yes",
            
            # Turn 9: Interview Prep for top candidate (interview_qgen_node, resolves "top candidate" to Alice Smith)
            "Generate prep questions for the top candidate",
            
            # Turn 10: Salary expectations (salary_node - Tavily fallback)
            "What is the average salary range for this role in India?"
        ]
        
        print("=================== MVP SIMULATION START ===================")
        for i, turn in enumerate(turns, 1):
            # Print turn header using safe ascii formatting
            print(f"\n[Turn {i}] User: {turn}")
            state["conversation_history"].append({"role": "user", "content": turn})
            
            # Invoke Graph
            state = graph.invoke(state)
            
            # Print Assistant response
            last_msg = state["conversation_history"][-1]
            safe_content = last_msg['content'].encode('ascii', errors='replace').decode('ascii')
            print(f"Agent ({state['last_intent']}):\n{safe_content}")
            
        print("\n=================== MVP SIMULATION END ===================")
    finally:
        # Stop all patches
        for p in patches:
            p.stop()

if __name__ == "__main__":
    run_simulation()
