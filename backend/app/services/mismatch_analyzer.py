import json
import re
from typing import List, Dict, Any, Optional
from app.schemas.candidate_schema import Candidate
from app.core.llm_router import call_llm, parse_json_safely

def extract_experience_via_regex(text: str) -> Optional[float]:
    """
    Extracts total years of experience using regex heuristics.
    Looks for phrases like '7+ years', '5 years of experience', '8 yrs', etc.
    """
    patterns = [
        r"(?:\b|^)(?P<years>\d+(?:\.\d+)?)\s*\+?\s*years?\b(?:\s*of\s*experience|\s*experience|\s*in|\s*as)?",
        r"(?:\b|^)(?P<years>\d+(?:\.\d+)?)\s*\+?\s*yrs?\b"
    ]
    
    matches = []
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            try:
                val = float(match.group("years"))
                if 0.5 <= val <= 40.0:
                    matches.append(val)
            except ValueError:
                continue
                
    if matches:
        return max(matches)
    return None

def extract_candidate_experience(candidate: Candidate) -> float:
    """
    Extracts the candidate's total years of experience as a float from their resume.
    Uses regex heuristics first, falling back to LLM parsing if regex fails.
    """
    # Quick pre-check: check if experience is already parsed to avoid extra LLM call
    if hasattr(candidate, "experience_years") and candidate.experience_years is not None:
        return candidate.experience_years
        
    # Fast regex heuristic extraction
    regex_exp = extract_experience_via_regex(candidate.raw_text)
    if regex_exp is not None:
        candidate.experience_years = regex_exp
        return regex_exp
        
    system_instruction = (
        "You are an AI resume parser. Analyze the candidate's resume and extract their total years "
        "of professional working experience. Respond with a JSON object containing "
        "\"experience_years\": float. If it is less than a year or internship only, return a decimal value like 0.5. "
        "Output ONLY valid JSON. No other text."
    )
    prompt = f"Resume Content:\n{candidate.raw_text}"
    
    try:
        response_text, _, _ = call_llm(prompt, system_instruction=system_instruction, json_mode=True)
        data = parse_json_safely(response_text)
        exp = float(data.get("experience_years", 0.0))
        # Store on candidate object for caching
        candidate.experience_years = exp
        return exp
    except Exception as e:
        print(f"Error extracting experience years for {candidate.name}: {e}")
        return 0.0

def analyze_experience_mismatch(jd_experience: int, candidates: List[Candidate]) -> Dict[str, Any]:
    """
    Computes experience distribution, compares it with JD target experience,
    and returns mismatch analysis and actionable suggestions.
    """
    if not candidates:
        return {
            "has_mismatch": False,
            "message": "No candidates loaded to analyze experience mismatch."
        }
        
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=8) as executor:
        experiences = list(executor.map(extract_candidate_experience, candidates))
    avg_exp = sum(experiences) / len(experiences)
    
    underqualified = [exp for exp in experiences if exp < jd_experience]
    mismatch_percentage = (len(underqualified) / len(candidates)) * 100
    
    has_mismatch = mismatch_percentage >= 50.0
    
    message_lines = [
        f"Average experience of loaded candidates: **{avg_exp:.1f} years** (Target JD: **{jd_experience} years**)."
    ]
    
    if has_mismatch:
        message_lines.append(
            f"\n> [!WARNING]\n"
            f"> **Experience Mismatch Alert**: **{mismatch_percentage:.0f}%** of the candidates have less than the "
            f"required {jd_experience} years of experience. Consider lowering the required experience to **3 years** "
            f"to capture more of the applicant pool, or source candidates with more senior profiles."
        )
    else:
        message_lines.append("\nCandidate experience distribution aligns well with the job description requirements.")
        
    return {
        "has_mismatch": has_mismatch,
        "average_experience": avg_exp,
        "mismatch_percentage": mismatch_percentage,
        "message": "\n".join(message_lines)
    }

def suggest_jd_improvements(jd_raw_text: str) -> List[str]:
    """
    Analyzes the job description raw text and returns a list of suggested improvements
    such as missing salary ranges, location parameters, or benefits details.
    """
    system_instruction = (
        "You are an AI recruitment editor. Inspect the job description text and identify missing standard fields "
        "such as Compensation/Salary details, Job Location/Work Mode (Remote, Hybrid, Onsite), "
        "Company Benefits/Perks, or Reporting structure. "
        "Output a JSON object containing a list of strings: {\"suggestions\": [\"string\"]}. "
        "If all fields are present, return an empty list."
    )
    prompt = f"Job Description:\n{jd_raw_text}"
    
    try:
        response_text, _, _ = call_llm(prompt, system_instruction=system_instruction, json_mode=True)
        data = parse_json_safely(response_text)
        return data.get("suggestions", [])
    except Exception as e:
        print(f"Error checking JD improvements: {e}")
        return []


def detect_red_flags(candidate: Candidate) -> List[str]:
    """
    Uses LLM to detect timeline gaps, inconsistent dates, or suspicious patterns in a resume.
    Returns a list of strings (each string = one red flag description).
    If no red flags, returns an empty list [].
    """
    # Quick pre-check: check if red_flags is already parsed to avoid extra LLM call
    if hasattr(candidate, "red_flags") and candidate.red_flags is not None:
        return candidate.red_flags

    system_instruction = (
        "You are an expert resume analyst specializing in detecting red flags in candidate resumes. "
        "Carefully analyze the resume for: timeline gaps (unexplained periods of 6+ months), "
        "inconsistent dates (overlapping positions, suspicious date ranges), "
        "job hopping (multiple jobs < 1 year in a row), inflated or vague claims, "
        "and any other suspicious patterns. "
        "Output a JSON object: {\"red_flags\": [\"description 1\", \"description 2\"]}. "
        "If the resume looks clean with no issues, return {\"red_flags\": []}. "
        "Be specific and concise for each flag (max 2 sentences per flag). "
        "Output ONLY valid JSON, no other text."
    )
    prompt = (
        f"Analyze the following resume for red flags:\n\n"
        f"Candidate: {candidate.name}\n"
        f"Resume Content:\n{candidate.raw_text}"
    )

    try:
        response_text, _, _ = call_llm(prompt, system_instruction=system_instruction, json_mode=True)
        data = parse_json_safely(response_text)
        flags = [str(f) for f in data.get("red_flags", []) if f]
        candidate.red_flags = flags
        return flags
    except Exception as e:
        print(f"Error detecting red flags for {candidate.name}: {e}")
        return []

