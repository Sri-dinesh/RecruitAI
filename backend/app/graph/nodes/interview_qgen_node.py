import re
from typing import Any, List
from app.graph.state import RecruitState
from app.core.llm_router import call_llm
from app.graph.router_node import resolve_candidate_reference
from app.rag.embeddings import embed_text
from app.rag.vector_store import query_top_k

def interview_qgen_node(state: RecruitState) -> dict:
    """
    Generates tailored interview questions:
    1. For a specific candidate (with grounded resume chunks & gap probing)
    2. For 'everyone' / all candidates in the shortlist
    3. For the Job Description / Role in general
    """
    history = state.get("conversation_history", [])
    jd = state.get("jd_structured")
    resumes = state.get("resumes", [])
    shortlist = state.get("last_shortlist") or resumes
    user_msg = history[-1]["content"] if history else ""
    cleaned_msg = user_msg.lower().strip()
    
    # 1. Edge Case: JD not loaded
    if not jd:
        return {
            "conversation_history": history + [{
                "role": "assistant",
                "content": "I need a Job Description loaded first before I can generate interview prep questions. Please upload or paste a JD."
            }]
        }

    # 2. Check if user asked for "everyone", "all candidates", "both", etc.
    is_all_candidates = bool(re.search(r"\b(everyone|everybody|all candidates|all of them|all|both|entire list)\b", cleaned_msg))
    
    if is_all_candidates and resumes:
        target_candidates = (shortlist if shortlist else resumes)[:4]
        sections = []
        for cand in target_candidates:
            q_text = _generate_candidate_questions(cand, jd, state)
            sections.append(f"### 👤 Interview Prep for **{cand.name}**\n\n{q_text}")
            
        full_content = f"## 📋 Interview Questions for Candidates ({jd.role})\n\n" + "\n\n---\n\n".join(sections)
        return {
            "conversation_history": history + [{
                "role": "assistant",
                "content": full_content
            }]
        }

    # 3. Check if user asked for JD/role-level interview questions
    is_jd_level = bool(re.search(r"\b(job description|jd|for the role|role|general|position)\b", cleaned_msg)) and not resolve_candidate_reference(user_msg, state)

    if is_jd_level:
        questions = _generate_jd_role_questions(jd)
        return {
            "conversation_history": history + [{
                "role": "assistant",
                "content": f"### 📋 Role Interview Preparation: **{jd.role}**\n\n{questions}"
            }]
        }

    # 4. Resolve specific candidate ID
    candidate_id = resolve_candidate_reference(user_msg, state)
    
    # If not resolved and resumes exist, check if there's only 1 candidate or ask
    if not candidate_id:
        if len(resumes) == 1:
            candidate = resumes[0]
        elif len(shortlist) == 1:
            candidate = shortlist[0]
        else:
            cand_names = [f"**{c.name}**" for c in (shortlist if shortlist else resumes)[:3]]
            return {
                "conversation_history": history + [{
                    "role": "assistant",
                    "content": f"Which candidate would you like to generate interview questions for? (e.g. {', '.join(cand_names)}, 'the top candidate', or 'for everyone')."
                }]
            }
    else:
        # Find candidate object in state resumes or shortlist
        candidate = next((c for c in resumes if c.candidate_id == candidate_id), None)
        if not candidate:
            candidate = next((c for c in shortlist if c.candidate_id == candidate_id), None)

    if not candidate:
        # Fallback to top candidate or JD questions
        if resumes:
            candidate = resumes[0]
        else:
            questions = _generate_jd_role_questions(jd)
            return {
                "conversation_history": history + [{
                    "role": "assistant",
                    "content": f"### 📋 Role Interview Preparation: **{jd.role}**\n\n{questions}"
                }]
            }

    # 5. Generate candidate questions
    questions = _generate_candidate_questions(candidate, jd, state)
    heading = f"### 👤 Interview Prep Questions for **{candidate.name}** ({jd.role})\n\n"
    
    return {
        "conversation_history": history + [{
            "role": "assistant",
            "content": heading + questions
        }]
    }


def _generate_candidate_questions(candidate: Any, jd: Any, state: RecruitState) -> str:
    """Retrieves chunks from pgvector and calls LLM for grounded candidate questions."""
    candidate_text = ""
    try:
        query_text = f"Candidate skills and experience for role: {jd.role}"
        query_emb = embed_text(query_text)
        chunks = query_top_k(query_emb, k=3, candidate_id=candidate.candidate_id, user_id=state.get("user_id"))
        if chunks:
            candidate_text = "\n\n".join([c["chunk_text"] for c in chunks])
    except Exception as e:
        print(f"Error fetching chunks: {e}")

    if not candidate_text:
        candidate_text = candidate.raw_text or f"Skills: {', '.join(candidate.skills or [])}"

    system_instruction = (
        "You are an expert technical recruiter and interviewer. Generate 4-6 grounded interview questions for a candidate "
        "based on their resume details and the target job description. "
        "Provide a mix of technical proficiency, behavioral, and gap-probing questions. "
        "Output the questions in clean, professional markdown with numbered sections."
    )
    
    gaps_list = candidate.gaps or []
    prompt = (
        f"Generate interview prep questions for {candidate.name} applying for the role of '{jd.role}'.\n\n"
        f"Required Skills for Job: {', '.join(jd.required_skills)}\n"
        f"Candidate's Identified Skill Gaps: {', '.join(gaps_list) if gaps_list else 'None identified'}\n\n"
        "Candidate Resume Context:\n"
        "<candidate_resume>\n"
        f"{candidate_text[:3000]}\n"
        "</candidate_resume>\n\n"
        "Interview Questions (Markdown):"
    )
    
    try:
        response_text, _, _ = call_llm(
            prompt=prompt,
            system_instruction=system_instruction
        )
        return response_text.strip()
    except Exception as e:
        print(f"LLM call failed in interview_qgen_node: {e}. Utilizing Local Autonomous RAG Synthesizer.")
        return _generate_local_questions(candidate, jd)


def _generate_jd_role_questions(jd: Any) -> str:
    """Generates standard role-level interview questions based on JD requirements."""
    skills_str = ", ".join(jd.required_skills) if jd.required_skills else "Software Engineering"
    resp_str = "\n- ".join(jd.responsibilities[:4]) if jd.responsibilities else "Core engineering tasks"
    
    system_instruction = (
        "You are a technical hiring manager. Generate 5 core technical and architectural interview questions "
        "to evaluate candidates for this job description. Include evaluation criteria for each question."
    )
    prompt = (
        f"Job Title: {jd.role}\n"
        f"Required Experience: {jd.experience_years}+ years\n"
        f"Key Skills: {skills_str}\n"
        f"Key Responsibilities:\n- {resp_str}\n\n"
        "Generate 5 structured interview questions in clean markdown."
    )
    try:
        response_text, _, _ = call_llm(prompt=prompt, system_instruction=system_instruction)
        return response_text.strip()
    except Exception as e:
        print(f"LLM call failed for JD questions: {e}")
        return f"""#### 1. Core Technical Architecture
- Can you explain your experience with **{skills_str}** and how you have designed scalable systems in past projects?

#### 2. Hands-on Problem Solving
- How do you handle concurrency, distributed transactions, and data consistency in production?

#### 3. Operational Excellence & Reliability
- Describe your process for monitoring API latencies, debugging production issues, and writing robust tests.

#### 4. Team Leadership & Collaboration
- Tell us about a time you mentored junior engineers or made a major technical trade-off under tight deadlines."""


def _generate_local_questions(candidate: Any, jd: Any) -> str:
    """Autonomous deterministic interview question generator based on candidate skills & gaps."""
    c_skills = ", ".join((candidate.skills or [])[:5]) or "general development"
    gaps = candidate.gaps or []
    
    q_lines = [
        f"These questions evaluate **{candidate.name}**'s experience with **{c_skills}** against the **{jd.role}** requirements.\n"
    ]
    
    q_lines.append("#### 1. Technical Architecture & Core Proficiency")
    q_lines.append(f"\"Your background highlights experience with **{c_skills}**. Can you walk us through a recent project where you designed the core system architecture, explaining how you handled state management and database consistency?\"\n")
    
    if gaps:
        gap_str = ", ".join(gaps[:2])
        q_lines.append("#### 2. Skill Gap Exploration & Adaptability")
        q_lines.append(f"\"The role requires proficiency in **{gap_str}**. Based on your experience in **{c_skills}**, how would you ramp up and apply these competencies in our environment?\"\n")
    else:
        q_lines.append("#### 2. Deep-Dive Technical Optimization")
        q_lines.append(f"\"How do you measure and optimize API response latencies and database query performance in production environments using **{c_skills}**?\"\n")
        
    q_lines.append("#### 3. System Design & Scalability")
    q_lines.append("\"Describe how you would design a high-throughput, concurrent backend API handling peak traffic spikes with zero-downtime guarantees.\"\n")
    
    q_lines.append("#### 4. Behavioral & Engineering Mindset")
    q_lines.append("\"Tell us about a time you encountered a critical production bug or breaking API change close to a release deadline. How did you diagnose, resolve, and prevent future recurrences?\"\n")

    return "\n".join(q_lines)
