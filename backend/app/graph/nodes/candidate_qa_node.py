import re
from typing import Dict, Any, List, Optional
from app.graph.state import RecruitState
from app.core.llm_router import call_llm
from app.schemas.candidate_schema import Candidate
from app.rag.embeddings import embed_texts
from app.rag.vector_store import query_top_k

def candidate_qa_node(state: RecruitState) -> dict:
    """
    Candidate Question Answering Node.
    Answers candidate-specific questions regarding skills, projects, work experience,
    education, background, and candidate details using RAG retrieval & candidate metadata.
    """
    history = state.get("conversation_history", [])
    user_query = history[-1]["content"] if history else ""
    resumes = state.get("resumes", [])
    jd = state.get("jd_structured")
    
    # 1. Identify target candidate
    target_candidate: Optional[Candidate] = None
    query_lower = user_query.lower()
    
    # Search by name or candidate_id in state
    for candidate in resumes:
        name_parts = [p.lower() for p in candidate.name.split()]
        if any(part in query_lower for part in name_parts if len(part) > 2) or candidate.candidate_id in query_lower:
            target_candidate = candidate
            break
            
    # 2. Retrieve candidate context
    context_text = ""
    candidate_name = target_candidate.name if target_candidate else "the candidate"
    
    if target_candidate:
        context_text += f"Candidate Name: {target_candidate.name}\n"
        if target_candidate.headline:
            context_text += f"Title/Headline: {target_candidate.headline}\n"
        if target_candidate.experience_years:
            context_text += f"Experience: {target_candidate.experience_years} years\n"
        if target_candidate.skills:
            context_text += f"Extracted Skills: {', '.join(target_candidate.skills)}\n"
        if target_candidate.work_experience:
            context_text += f"Work Experience: {'; '.join(target_candidate.work_experience)}\n"
        if target_candidate.education:
            context_text += f"Education: {'; '.join(target_candidate.education)}\n"
        if target_candidate.links:
            context_text += f"Links/Portfolio: {', '.join(target_candidate.links)}\n"
        if target_candidate.summary:
            context_text += f"Summary: {target_candidate.summary}\n"
            
        context_text += f"\nFull Resume Text:\n{target_candidate.raw_text[:3000]}\n"
    else:
        # If no specific candidate matched directly, compile text from all loaded resumes
        if resumes:
            context_text = "Available Loaded Candidates:\n\n"
            for c in resumes[:5]:
                context_text += f"--- Candidate: {c.name} ---\nSkills: {', '.join(c.skills[:10])}\n{c.raw_text[:1000]}\n\n"
        else:
            context_text = "No candidate resumes are currently loaded in the active workspace context."

    # 3. Vector DB RAG Search Fallback/Augment
    try:
        query_emb = embed_texts([user_query])
        if query_emb:
            c_id_filter = target_candidate.candidate_id if target_candidate else None
            top_chunks = query_top_k(query_emb[0], k=3, candidate_id=c_id_filter)
            if top_chunks:
                context_text += "\nVector Retrieval Snippets:\n"
                for chunk in top_chunks:
                    context_text += f"- {chunk.get('chunk_text', '')}\n"
    except Exception as e:
        print(f"RAG query error in candidate_qa_node: {e}")

    # 4. Synthesize direct, helpful answer using LLM
    system_instruction = (
        "You are an expert AI recruitment assistant answering a specific question about candidate(s). "
        "Answer the question directly, concisely, and professionally based on the provided candidate resume context. "
        "Use bullet points for lists like skills, projects, or work history when appropriate."
    )
    
    prompt = (
        f"User Question: \"{user_query}\"\n\n"
        f"Candidate Resume Context:\n{context_text}\n\n"
        "Answer:"
    )
    
    try:
        response_text, _, _ = call_llm(
            prompt=prompt,
            system_instruction=system_instruction
        )
        answer = response_text.strip()
    except Exception as e:
        answer = f"Failed to retrieve details for {candidate_name}: {str(e)}"
        
    return {
        "conversation_history": history + [{
            "role": "assistant",
            "content": answer
        }],
        "last_intent": "query_candidate"
    }
