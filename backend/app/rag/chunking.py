from typing import List, Dict

def chunk_resume(text: str, candidate_id: str, candidate_name: str, chunk_size_words: int = 150, overlap_words: int = 25) -> List[Dict]:
    words = text.split()
    chunks = []
    
    # If the resume is short enough, keep it as a single chunk
    if len(words) <= chunk_size_words:
        chunks.append({
            "candidate_id": candidate_id,
            "candidate_name": candidate_name,
            "chunk_text": text
        })
        return chunks
        
    start = 0
    while start < len(words):
        end = start + chunk_size_words
        chunk_words = words[start:end]
        chunk_text = " ".join(chunk_words)
        
        chunks.append({
            "candidate_id": candidate_id,
            "candidate_name": candidate_name,
            "chunk_text": chunk_text
        })
        
        # Advance by size minus overlap
        start += (chunk_size_words - overlap_words)
        
        # Prevent infinite loops if parameters are misconfigured
        if chunk_size_words <= overlap_words:
            break
            
    return chunks
