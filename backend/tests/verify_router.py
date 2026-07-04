import sys
from pathlib import Path

# Add backend/ to search path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.graph.router_node import route_and_log
from app.graph.state import RecruitState
from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription

# Mock RecruitState
mock_state: RecruitState = {
    "jd_structured": JobDescription(
        role="Senior Full Stack Engineer",
        required_skills=["Python", "React", "Node.js"],
        experience_years=5,
        raw_text="Mock JD..."
    ),
    "resumes": [
        Candidate(candidate_id="alice_smith", name="Alice Smith", raw_text="Alice's resume..."),
        Candidate(candidate_id="bob_jones", name="Bob Jones", raw_text="Bob's resume...")
    ],
    "conversation_history": [],
    "last_shortlist": [
        Candidate(candidate_id="alice_smith", name="Alice Smith", raw_text="Alice's resume...", match_score=95.0),
        Candidate(candidate_id="bob_jones", name="Bob Jones", raw_text="Bob's resume...", match_score=80.0)
    ],
    "pending_confirmation": None,
    "last_intent": None
}

queries = [
    # 1. Regex Pre-check Count
    "How many applicants do we have?",
    # 2. Regex Pre-check Finalize
    "Finalize the shortlist now",
    # 3. Greeting / Other
    "Hello agent! What can you do?",
    # 4. Screening
    "Who is the best match for our Senior Full Stack Engineer role?",
    # 5. JD Rewrite
    "Rewrite the job description to make it sound more exciting and startup-oriented.",
    # 6. Salary benchmark
    "What is the average salary expectation for a React developer in India?",
    # 7. Interview Qs with explicit candidate name
    "Give me interview questions for candidate Bob Jones.",
    # 8. Interview Qs with referential candidate ("top candidate")
    "Generate prep questions for the top candidate.",
    # 9. Out of scope / Ambiguous
    "What is the weather in Delhi?",
    # 10. Ambiguous / Greeting
    "help"
]

def run_verification():
    print("=================== ROUTER VERIFICATION START ===================")
    
    # Check if API keys are configured
    from app.core.config import GEMINI_API_KEY, GROQ_API_KEY
    if (not GEMINI_API_KEY or "your_gemini" in GEMINI_API_KEY) and (not GROQ_API_KEY or "your_groq" in GROQ_API_KEY):
        print("[WARNING] LLM API Keys are not set in .env. LLM-based router queries will fail.")
        print("We will still run the rule-based ones.")
        
    for i, q in enumerate(queries, 1):
        print(f"\nQuery #{i}: \"{q}\"")
        try:
            intent, confidence, resolved_candidate = route_and_log(q, mock_state)
            print(f" -> Intent: {intent}")
            print(f" -> Confidence: {confidence:.2f}")
            print(f" -> Resolved Candidate: {resolved_candidate}")
        except Exception as e:
            print(f" -> Error during routing: {e}")
            
    print("\n=================== ROUTER VERIFICATION END ===================")

if __name__ == "__main__":
    run_verification()
