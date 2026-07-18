from typing import List, Dict

def chunk_resume(text: str, candidate_id: str, candidate_name: str, chunk_size_words: int = 150, overlap_words: int = 25) -> List[Dict]:
    """
    Context-aware chunking that splits resumes by paragraphs first, 
    preserving semantic sections (e.g. Experience, Education) before splitting by size.
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks = []
    
    current_chunk_words = []
    
    for para in paragraphs:
        para_words = para.split()
        
        # If adding this paragraph exceeds chunk size, finalize the current chunk
        if len(current_chunk_words) + len(para_words) > chunk_size_words and current_chunk_words:
            chunks.append({
                "candidate_id": candidate_id,
                "candidate_name": candidate_name,
                "chunk_text": " ".join(current_chunk_words)
            })
            # Overlap context from the end of the previous chunk
            current_chunk_words = current_chunk_words[-overlap_words:] if overlap_words > 0 else []
            
        current_chunk_words.extend(para_words)
        
        # If a single paragraph is larger than chunk_size_words (rare but possible),
        # force split it.
        while len(current_chunk_words) > chunk_size_words:
            chunks.append({
                "candidate_id": candidate_id,
                "candidate_name": candidate_name,
                "chunk_text": " ".join(current_chunk_words[:chunk_size_words])
            })
            current_chunk_words = current_chunk_words[chunk_size_words - overlap_words:]
            
    if current_chunk_words:
        chunks.append({
            "candidate_id": candidate_id,
            "candidate_name": candidate_name,
            "chunk_text": " ".join(current_chunk_words)
        })
        
    return chunks
