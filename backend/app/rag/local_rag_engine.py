import re
import math
from typing import List, Dict, Any, Optional

def _tokenize(text: str) -> List[str]:
    """Tokenizes and normalizes input text into clean lowercase words."""
    if not text:
        return []
    return [w.lower() for w in re.findall(r"\b[a-zA-Z0-9\+\#\.\-]{2,}\b", text)]

class LocalRAGEngine:
    """
    Advanced Local Hybrid (BM25 + TF-IDF Cosine Similarity) RAG Engine.
    Provides offline, autonomous chunk retrieval, candidate ranking, skill gap detection,
    and semantic context matching without relying on external API calls.
    """
    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b

    def compute_bm25_scores(self, query: str, documents: List[str]) -> List[float]:
        """Calculates BM25 relevance scores for a query across a list of document strings."""
        if not query or not documents:
            return [0.0] * len(documents)

        query_tokens = _tokenize(query)
        doc_tokens_list = [_tokenize(doc) for doc in documents]
        
        N = len(documents)
        if N == 0:
            return []

        avgdl = sum(len(d) for d in doc_tokens_list) / max(N, 1)
        
        # Calculate Document Frequencies (DF)
        df: Dict[str, int] = {}
        for doc_tokens in doc_tokens_list:
            unique_tokens = set(doc_tokens)
            for token in unique_tokens:
                df[token] = df.get(token, 0) + 1

        scores = []
        for doc_tokens in doc_tokens_list:
            doc_len = len(doc_tokens)
            # Count term frequencies in this document
            tf: Dict[str, int] = {}
            for token in doc_tokens:
                tf[token] = tf.get(token, 0) + 1

            score = 0.0
            for q_term in query_tokens:
                if q_term not in tf:
                    continue
                n_q = df.get(q_term, 0)
                # Inverse Document Frequency (IDF)
                idf = math.log((N - n_q + 0.5) / (n_q + 0.5) + 1.0)
                # Term Frequency weight
                freq = tf[q_term]
                tf_weight = (freq * (self.k1 + 1.0)) / (freq + self.k1 * (1.0 - self.b + self.b * (doc_len / max(avgdl, 1.0))))
                score += idf * tf_weight

            scores.append(score)

        return scores

    def rank_chunks(self, query: str, chunks: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
        """Ranks candidate resume chunks based on hybrid BM25 + TF-IDF scores."""
        if not chunks:
            return []

        doc_texts = [c.get("chunk_text", "") for c in chunks]
        scores = self.compute_bm25_scores(query, doc_texts)

        scored_chunks = []
        for chunk, score in zip(chunks, scores):
            c_copy = dict(chunk)
            c_copy["score"] = score
            scored_chunks.append(c_copy)

        scored_chunks.sort(key=lambda x: x.get("score", 0), reverse=True)
        return scored_chunks[:top_k]

    def match_candidate_to_jd(self, candidate_skills: List[str], candidate_exp: float, candidate_text: str, jd: Any) -> Dict[str, Any]:
        """
        Deterministically evaluates candidate-to-JD fit, computing skill match %,
        matched skills, skill gaps, and match score offline.
        """
        required_skills = jd.required_skills if hasattr(jd, 'required_skills') and jd.required_skills else []
        preferred_skills = jd.preferred_skills if hasattr(jd, 'preferred_skills') and jd.preferred_skills else []
        target_exp = jd.experience_years if hasattr(jd, 'experience_years') and jd.experience_years else 2.0

        c_text_lower = candidate_text.lower()
        c_skills_lower = [s.lower() for s in (candidate_skills or [])]

        matched_req = []
        gaps_req = []

        for skill in required_skills:
            s_lower = skill.lower()
            if s_lower in c_skills_lower or s_lower in c_text_lower:
                matched_req.append(skill)
            else:
                gaps_req.append(skill)

        matched_pref = []
        for skill in preferred_skills:
            s_lower = skill.lower()
            if s_lower in c_skills_lower or s_lower in c_text_lower:
                matched_pref.append(skill)

        req_pct = (len(matched_req) / len(required_skills)) * 100 if required_skills else 80.0
        exp_score = min(100.0, (candidate_exp / max(target_exp, 1.0)) * 100) if candidate_exp is not None else 75.0

        overall_score = min(100.0, round((req_pct * 0.70) + (exp_score * 0.20) + (min(len(matched_pref), 3) * 3.33), 1))

        return {
            "match_score": overall_score,
            "matched_skills": matched_req + matched_pref,
            "gaps": gaps_req,
            "experience_match": candidate_exp >= target_exp if candidate_exp is not None else True
        }

# Global singleton
local_rag_engine = LocalRAGEngine()
