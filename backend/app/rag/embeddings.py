"""
backend/app/rag/embeddings.py
------------------------------
Cloud-based vector embeddings using Google Gemini Embedding 2 model (gemini-embedding-2).
Output dimensionality is configured to 384 dimensions to match the pgvector schema
and IVFFlat indexing in public.resume_chunks without requiring local GPU/ML model weights.
"""

import os
import logging
from typing import List
from concurrent.futures import ThreadPoolExecutor
from google import genai
from google.genai import types

from app.core.config import GEMINI_API_KEY

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "gemini-embedding-2"
EMBEDDING_DIM = 384

_client = None


def get_genai_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = GEMINI_API_KEY or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            logger.warning("[embeddings] GEMINI_API_KEY is not set.")
        _client = genai.Client(api_key=api_key)
    return _client


def embed_text(text: str) -> List[float]:
    """
    Embeds a single string into a 384-dimensional vector using Google Gemini Embedding 2 Cloud.
    """
    if not text or not text.strip():
        return [0.0] * EMBEDDING_DIM

    try:
        client = get_genai_client()
        resp = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text.strip(),
            config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM)
        )
        if resp.embeddings and len(resp.embeddings) > 0:
            return resp.embeddings[0].values
        return [0.0] * EMBEDDING_DIM
    except Exception as exc:
        logger.error(f"[embeddings] gemini-embedding-2 call failed: {exc}")
        return _fallback_deterministic_vector(text)


def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Embeds multiple strings concurrently using Google Gemini Embedding 2 Cloud.
    """
    if not texts:
        return []

    max_workers = min(10, max(1, len(texts)))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(embed_text, texts))
    return results


def _fallback_deterministic_vector(text: str) -> List[float]:
    """Generates a reproducible 384-d normalized vector if cloud API is temporarily unavailable."""
    import hashlib
    import math
    h = hashlib.sha256(text.encode("utf-8")).digest()
    vals = [(h[i % len(h)] / 255.0) - 0.5 for i in range(EMBEDDING_DIM)]
    norm = math.sqrt(sum(x * x for x in vals)) or 1.0
    return [round(x / norm, 6) for x in vals]
