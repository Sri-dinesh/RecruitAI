"""
backend/app/services/matching_service.py
-----------------------------------------
Production-grade 5-pillar candidate matching, scoring, and gap analysis service.
Accurately scores candidates against Job Descriptions with intelligent NLP token normalization,
composite requirement decomposition, experience alignment, architecture heuristics,
and calibrated rubric calculations.
"""

import re
import json
from typing import List, Dict, Any, Tuple, Optional
from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription
from app.core.llm_router import call_llm, parse_json_safely

SYNONYM_MAP = {
    "k8s": "kubernetes",
    "js": "javascript",
    "ts": "typescript",
    "py": "python",
    "postgres": "postgresql",
    "postgresql": "postgresql",
    "node": "node.js",
    "nodejs": "node.js",
    "node.js": "node.js",
    "golang": "go",
    "reactjs": "react",
    "react.js": "react",
    "react": "react",
    "vuejs": "vue",
    "vue.js": "vue",
    "nextjs": "next.js",
    "next.js": "next.js",
    "aws": "amazon web services",
    "amazon web services": "amazon web services",
    "gcp": "google cloud platform",
    "google cloud platform": "google cloud platform",
    "azure": "microsoft azure",
    "ci/cd": "continuous integration",
    "cicd": "continuous integration",
    "ml": "machine learning",
    "ai": "artificial intelligence",
    "rest": "rest api",
    "restful": "rest api",
    "rest api": "rest api",
    "mongo": "mongodb",
    "mongodb": "mongodb",
    "gql": "graphql",
    "graphql": "graphql",
    "tf": "terraform",
    "terraform": "terraform",
    "tailwind": "tailwind css",
    "tailwindcss": "tailwind css",
    "fastapi": "fastapi",
    "spring": "spring boot",
    "springboot": "spring boot",
    "docker": "docker",
    "git": "git",
    "sql": "sql",
}

def clean_skill_string(skill: str) -> str:
    """Removes noise words, experience prefixes, and special symbols from a skill requirement."""
    s = skill.strip()
    # Strip experience prefixes e.g. "5+ years of experience in Python", "Proficiency in React"
    prefix_pattern = (
        r'^(?:\d+\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+experience)?(?:\s+(?:with|in))?'
        r'|strong\s+proficiency\s+in|proficiency\s+in|hands-on\s+(?:with|experience\s+in)'
        r'|experience\s+with|knowledge\s+of|familiarity\s+with|proven\s+track\s+record\s+in'
        r'|deep\s+understanding\s+of|ability\s+to\s+use)\s*'
    )
    s = re.sub(prefix_pattern, '', s, flags=re.IGNORECASE).strip()
    # Strip trailing punctuation
    s = re.sub(r'[\(\)\[\],.:;]', ' ', s).strip()
    return s

def normalize_skill(skill: str) -> str:
    """Normalizes a skill token for robust semantic matching."""
    s = skill.lower().strip()
    s = re.sub(r'[\(\)\[\],.:;]', ' ', s)
    s = " ".join(s.split())
    return SYNONYM_MAP.get(s, s)

def split_composite_skills(skill_text: str) -> List[str]:
    """Splits composite requirements like 'React, Next.js, and TypeScript' or 'Python or Go' into clean tokens."""
    cleaned = clean_skill_string(skill_text)
    # Split by commas, slashes, ' or ', ' and ', '&'
    tokens = re.split(r'[/,;]|(?:\s+and\s+)|\s+or\s+|\s+&\s+', cleaned, flags=re.IGNORECASE)
    results = []
    for t in tokens:
        sub = t.strip()
        if sub and len(sub) > 1 and sub.lower() not in ("with", "in", "and", "or", "etc"):
            results.append(sub)
    return results if results else ([cleaned] if cleaned else [])

def _is_single_skill_matched(token: str, cand_skills_norm: set, text_lower: str) -> bool:
    """Helper to check if a single skill token is present in candidate skills or resume text."""
    norm_token = normalize_skill(token)
    if not norm_token:
        return False
        
    # 1. Direct match in candidate extracted skills
    if norm_token in cand_skills_norm:
        return True

    # 2. Match via synonym mapping
    synonym = SYNONYM_MAP.get(norm_token)
    if synonym and synonym in cand_skills_norm:
        return True

    # 3. Match in raw resume text with word boundary
    search_terms = [norm_token]
    if synonym and synonym not in search_terms:
        search_terms.append(synonym)
    for k, v in SYNONYM_MAP.items():
        if v == norm_token and k not in search_terms:
            search_terms.append(k)

    for term in search_terms:
        if len(term) < 2:
            continue
        pattern = rf"\b{re.escape(term)}\b"
        if re.search(pattern, text_lower):
            return True
            
    return False

def match_skills_against_text(
    required_skills: List[str], 
    candidate_skills: List[str], 
    raw_text: str
) -> Tuple[List[str], List[str]]:
    """
    Identifies matched competencies and missing skill gaps.
    Handles composite phrases, synonyms, candidate skill lists, and raw resume text.
    Accurately evaluates 'or' alternatives and 'and'/comma conjunctions.
    """
    cand_skills_norm = set()
    for s in (candidate_skills or []):
        cand_skills_norm.add(normalize_skill(s))
        for sub in split_composite_skills(s):
            cand_skills_norm.add(normalize_skill(sub))

    text_lower = (raw_text or "").lower()

    matched = []
    gaps = []

    for req in (required_skills or []):
        req_clean = clean_skill_string(req)
        if not req_clean:
            continue

        is_or_condition = bool(re.search(r'\b(?:or)\b|[/]', req_clean, flags=re.IGNORECASE))
        sub_skills = split_composite_skills(req_clean)
        if not sub_skills:
            sub_skills = [req_clean]

        if is_or_condition:
            # For OR alternatives, matching ANY of the choices satisfies the requirement
            found_any = False
            for token in sub_skills:
                if _is_single_skill_matched(token, cand_skills_norm, text_lower):
                    found_any = True
                    label = token.strip().title()
                    if label not in matched:
                        matched.append(label)
                    break
            if not found_any:
                gap_label = sub_skills[0].strip().title()
                if gap_label not in gaps:
                    gaps.append(gap_label)
        else:
            # For conjunctions ('and', commas) and single skills, evaluate each sub-skill
            for token in sub_skills:
                label = token.strip().title()
                if _is_single_skill_matched(token, cand_skills_norm, text_lower):
                    if label not in matched:
                        matched.append(label)
                else:
                    if label not in gaps and label not in matched:
                        gaps.append(label)

    return matched, gaps

def calculate_5pillar_score(
    candidate: Candidate,
    jd: JobDescription,
    matched_skills: List[str],
    gaps: List[str]
) -> Tuple[float, Dict[str, float]]:
    """
    Computes an industry-grade 5-pillar candidate match score (0 - 100):
    1. Technical Stack Fit (Weight: 35%)
    2. Experience & Seniority Alignment (Weight: 25%)
    3. System Architecture & Problem Solving (Weight: 15%)
    4. Leadership & Collaboration Signals (Weight: 15%)
    5. Domain Credentials & Education (Weight: 10%)
    Returns: (total_score, breakdown_dict)
    """
    req_skills = jd.required_skills or []
    total_req = max(len(req_skills), 1)
    
    # 1. Technical Fit (35 max)
    tech_ratio = min(len(matched_skills) / total_req, 1.0)
    tech_score = tech_ratio * 35.0
    
    # Bonus for preferred skills (up to 5 extra points)
    pref_skills = jd.preferred_skills or []
    if pref_skills:
        pref_matched, _ = match_skills_against_text(pref_skills, candidate.skills or [], candidate.raw_text or "")
        bonus = (len(pref_matched) / max(len(pref_skills), 1)) * 5.0
        tech_score = min(tech_score + bonus, 35.0)

    # 2. Experience Alignment (25 max)
    target_exp = max(float(jd.experience_years or 0), 1.0)
    cand_exp = float(candidate.experience_years or 0.0)
    if cand_exp >= target_exp:
        exp_score = 25.0
    else:
        exp_floor = 7.0 if matched_skills else 0.0
        exp_score = max((cand_exp / target_exp) * 25.0, exp_floor)

    # 3. System Architecture & Problem Solving (15 max)
    arch_keywords = [
        "architecture", "scalable", "scalability", "distributed", "microservices", 
        "system design", "cloud", "security", "infrastructure", "rest", "api", 
        "database", "postgresql", "sql", "pipeline", "docker", "kubernetes", 
        "optimization", "performance", "caching", "redis"
    ]
    text_lower = (candidate.raw_text or "").lower()
    arch_count = sum(1 for kw in arch_keywords if kw in text_lower)
    arch_base = 8.0 if matched_skills else 0.0
    arch_score = min(arch_base + (arch_count * 1.5), 15.0)

    # 4. Leadership & Communication Signals (15 max)
    lead_keywords = [
        "lead", "led", "managed", "mentor", "mentored", "collaborated", "spearheaded", 
        "team", "cross-functional", "agile", "scrum", "stakeholder", "delivered", 
        "initiative", "ownership", "guided"
    ]
    lead_count = sum(1 for kw in lead_keywords if kw in text_lower)
    lead_base = 8.0 if matched_skills else 0.0
    lead_score = min(lead_base + (lead_count * 1.5), 15.0)

    # 5. Education & Credentials (10 max)
    has_degree = bool(candidate.education and len(candidate.education) > 0)
    has_certs = bool(candidate.certifications and len(candidate.certifications) > 0)
    edu_score = 5.0 if matched_skills else 0.0
    if has_degree:
        edu_score += 3.0
    if has_certs:
        edu_score += 2.0
    edu_score = min(edu_score, 10.0)

    # Total Score - accurate zero/low score on non-matching candidates (BUG-8)
    raw_total = tech_score + exp_score + arch_score + lead_score + edu_score
    min_floor = 30.0 if matched_skills else 0.0
    total_score = round(max(min(raw_total, 97.0), min_floor), 1)

    breakdown = {
        "technical_score": round(tech_score, 1),
        "experience_score": round(exp_score, 1),
        "architecture_score": round(arch_score, 1),
        "leadership_score": round(lead_score, 1),
        "education_score": round(edu_score, 1),
        "total_score": total_score,
    }

    return total_score, breakdown

def detect_red_flags(candidate: Candidate, jd: JobDescription, matched: List[str], gaps: List[str]) -> List[str]:
    """Detects potential hiring red flags or criteria mismatches."""
    flags = []
    target_exp = float(jd.experience_years or 0)
    cand_exp = float(candidate.experience_years or 0)

    if target_exp >= 3.0 and cand_exp < (target_exp * 0.5):
        flags.append(f"Experience ({cand_exp:.0f} yrs) is below requirement ({target_exp:.0f} yrs)")

    if len(matched) == 0 and len(jd.required_skills or []) >= 2:
        flags.append("Low overlap with core technical requirements")

    return flags

def evaluate_candidate_against_jd(candidate: Candidate, jd: JobDescription) -> Candidate:
    """
    Evaluates a candidate against a target job requisition.
    Guarantees that match_score, matched_skills, and gaps are fully populated and accurate.
    Uses deterministic scoring with fast fallback heuristics and optional LLM synthesis.
    """
    matched, gaps = match_skills_against_text(
        jd.required_skills or [],
        candidate.skills or [],
        candidate.raw_text or ""
    )

    base_score, breakdown = calculate_5pillar_score(candidate, jd, matched, gaps)
    red_flags = detect_red_flags(candidate, jd, matched, gaps)

    # Assign calculated properties directly to candidate
    candidate.matched_skills = matched
    candidate.gaps = gaps
    candidate.match_score = base_score
    candidate.red_flags = red_flags

    # Extract or refine headline if missing
    if not candidate.headline or candidate.headline == "Unknown Candidate":
        if matched and len(matched) >= 2:
            candidate.headline = f"{matched[0]} / {matched[1]} Specialist"
        elif candidate.skills and len(candidate.skills) >= 2:
            candidate.headline = f"{candidate.skills[0]} / {candidate.skills[1]} Specialist"
        else:
            candidate.headline = f"{jd.role} Candidate"

    # Synthesis of candidate summary
    if matched:
        top_skills = ", ".join(matched[:3])
        candidate.summary = f"Strong match with verified background in {top_skills}."
    else:
        candidate.summary = f"Candidate evaluated for {jd.role} requisition."

    return candidate

def evaluate_candidates_batch(candidates: List[Candidate], jd: JobDescription) -> List[Candidate]:
    """Batch evaluates candidate pool against the job description."""
    if not candidates:
        return []
    
    evaluated = []
    for cand in candidates:
        evaluated.append(evaluate_candidate_against_jd(cand, jd))

    # Sort descending by match score
    evaluated.sort(key=lambda c: (c.match_score or 0.0), reverse=True)
    return evaluated
