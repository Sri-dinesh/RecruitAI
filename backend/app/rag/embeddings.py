from sentence_transformers import SentenceTransformer
from typing import List

_model = None

def get_embedding_model():
    global _model
    if _model is None:
        # Load the 384-dimensional all-MiniLM-L6-v2 model
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model

def embed_text(text: str) -> List[float]:
    model = get_embedding_model()
    embedding = model.encode(text)
    return embedding.tolist()

def embed_texts(texts: List[str]) -> List[List[float]]:
    if not texts:
        return []
    model = get_embedding_model()
    embeddings = model.encode(texts)
    return [emb.tolist() for emb in embeddings]
