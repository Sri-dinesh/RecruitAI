import hashlib
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Optional

from app.core.config import EMBED_BATCH_SIZE

_model = None
_embedding_cache: Dict[str, List[float]] = {}
_CACHE_MAX_SIZE = 128

def get_embedding_model():
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model

def preload_embedding_model() -> None:
    """Warm up the embedding model at startup to avoid first-request delay."""
    get_embedding_model()

def _cache_key(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()

def _cache_get(text: str) -> Optional[List[float]]:
    return _embedding_cache.get(_cache_key(text))

def _cache_set(text: str, embedding: List[float]) -> None:
    if len(_embedding_cache) >= _CACHE_MAX_SIZE:
        _embedding_cache.pop(next(iter(_embedding_cache)))
    _embedding_cache[_cache_key(text)] = embedding

def embed_text(text: str) -> List[float]:
    cached = _cache_get(text)
    if cached is not None:
        return cached
    model = get_embedding_model()
    embedding = model.encode(text, show_progress_bar=False).tolist()
    _cache_set(text, embedding)
    return embedding

def embed_texts(texts: List[str]) -> List[List[float]]:
    if not texts:
        return []
    model = get_embedding_model()
    embeddings = model.encode(
        texts,
        batch_size=EMBED_BATCH_SIZE,
        show_progress_bar=False,
    )
    result = [emb.tolist() for emb in embeddings]
    for text, embedding in zip(texts, result):
        _cache_set(text, embedding)
    return result
