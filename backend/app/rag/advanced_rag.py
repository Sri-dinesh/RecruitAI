import json
from typing import List, Dict, Any, Optional
from app.core.llm_router import call_llm, parse_json_safely

def expand_query(query: str, jd: Optional[Dict[str, Any]] = None) -> str:
    """
    Expands the user's screening query using the LLM to generate
    related skills, synonyms, and semantic variations.
    """
    system_instruction = (
        "You are an expert HR sourcer. Expand the user's search query into a comprehensive "
        "list of matching keywords, synonyms, alternative spelling, and closely related technical skills. "
        "Output ONLY the keywords separated by spaces. Do not write introductory or explanatory text."
    )
    prompt = f"Original Query: '{query}'"
    if jd:
        role = jd.get("role", "")
        skills = ", ".join(jd.get("required_skills", [])) if jd.get("required_skills") else ""
        prompt += f"\nActive JD Context: Role='{role}', Skills='{skills}'"
        
    try:
        response_text, _, _ = call_llm(prompt, system_instruction=system_instruction)
        expanded = response_text.strip().replace("\n", " ")
        # Clean potential markdown or quotes
        expanded = expanded.replace('"', '').replace("'", "")
        return f"{query} {expanded}"
    except Exception as e:
        print(f"Error in query expansion: {e}. Falling back to original query.")
        return query

def rerank_chunks(query: str, chunks: List[Dict[str, Any]], top_n: int = 3, jd: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Performs LLM-based relevance filtering of retrieved candidate resume chunks.
    Assigns a relevance score (1-10) to each chunk in a single batch call and retains only the top_n.
    If jd is provided, scores relevance against the job description requirements.
    """
    if not chunks:
        return []
        
    system_instruction = (
        "You are an AI recruitment ranker. Evaluate the relevance of the following resume snippets "
        "relative to the query and the required Job Description skills. Assign a relevance score from 1 to 10 for each snippet. "
        "Output a JSON object containing a list of scores, exactly like: "
        "{\"scores\": [{\"id\": 0, \"relevance_score\": X}, {\"id\": 1, \"relevance_score\": Y}, ...]} "
        "where id matches the index of the snippet. Do not include any other text."
    )
    
    snippets = []
    for idx, chunk in enumerate(chunks):
        chunk_text = chunk.get("chunk_text", "")
        snippets.append(f"Snippet ID: {idx}\nText: {chunk_text}")
        
    prompt = f"Query: {query}\n"
    if jd:
        role = jd.get("role", "")
        skills = ", ".join(jd.get("required_skills", [])) if jd.get("required_skills") else ""
        prompt += f"Job Role: {role}\nRequired Skills: {skills}\n"
    prompt += "\n---\n".join(snippets)
    
    try:
        response_text, _, _ = call_llm(prompt, system_instruction=system_instruction, json_mode=True)
        data = parse_json_safely(response_text)
        scores_list = data.get("scores", [])
        
        # Build index lookup map
        scores_map = {int(item.get("id")): float(item.get("relevance_score", 1.0)) for item in scores_list if "id" in item}
    except Exception as e:
        print(f"Error in batch reranking: {e}. Falling back to default scores.")
        scores_map = {}
        
    scored_chunks = []
    for idx, chunk in enumerate(chunks):
        score = scores_map.get(idx, 1.0)
        chunk_copy = dict(chunk)
        chunk_copy["rerank_score"] = score
        scored_chunks.append(chunk_copy)
        
    # Sort descending
    scored_chunks.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
    return scored_chunks[:top_n]
