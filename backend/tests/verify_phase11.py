import sys
from pathlib import Path

# Add backend/ to search path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.services.job_desc_api import fetch_live_job_description
from app.services.resume_api import parse_resume_via_api
from app.graph.builder import graph
from app.graph.state import RecruitState

def run_phase11_verification():
    print("=================== PHASE 11 VERIFICATION START ===================")
    
    # 1. Fetch live job description
    print("\n[Step 1] Fetching live job description for 'React Developer'...")
    jd = fetch_live_job_description("React Developer")
    print(f" -> Role title: {jd.role}")
    print(f" -> Required skills: {jd.required_skills}")
    print(f" -> Experience years: {jd.experience_years}")
    print(f" -> Text size: {len(jd.raw_text)} chars")
    
    # 2. Parse mock resume file bytes
    print("\n[Step 2] Parsing candidate resume via API (or local fallback)...")
    file_bytes = b"Name: Jane Doe\nSkills: Python, FastAPI, PostgreSQL, Docker\nExperience: 3 years"
    candidate = parse_resume_via_api(file_bytes, "Jane_Doe_Resume.txt")
    print(f" -> Candidate Name: {candidate.name}")
    print(f" -> Candidate ID: {candidate.candidate_id}")
    print(f" -> Raw Text size: {len(candidate.raw_text)} chars")
    
    # 3. Test end-to-end graph query for fetch_jd_api
    print("\n[Step 3] Running graph E2E simulation for 'fetch JD for Frontend Developer via API'...")
    state: RecruitState = {
        "jd_structured": None,
        "resumes": [],
        "conversation_history": [
            {"role": "user", "content": "fetch JD for Frontend Developer via API"}
        ],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": None
    }
    
    result = graph.invoke(state)
    print(f" -> Resulting Intent: {result['last_intent']}")
    print(f" -> Parsed JD Structured Role: {result['jd_structured'].role if result.get('jd_structured') else 'None'}")
    print(f" -> Conversation Response:")
    print(result["conversation_history"][-1]["content"])
    
    print("\n=================== PHASE 11 VERIFICATION END ===================")

if __name__ == "__main__":
    run_phase11_verification()
