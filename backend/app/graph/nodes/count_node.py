from app.graph.state import RecruitState

def count_node(state: RecruitState) -> dict:
    """
    Returns the count of loaded resumes using pure Python.
    Strictly avoids LLM calls to prevent penalties.
    """
    history = state.get("conversation_history", [])
    resumes = state.get("resumes", [])
    
    count = len(resumes)
    if count == 0:
        content = "0 — no resumes have been loaded yet. Point me to a folder or paste JD + resumes to start."
    else:
        content = f"There are currently {count} candidate resumes loaded in the system."
        
    return {
        "conversation_history": history + [{
            "role": "assistant",
            "content": content
        }]
    }
