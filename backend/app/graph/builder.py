from langgraph.graph import StateGraph, END
from app.graph.state import RecruitState
from app.graph.router_node import route_and_log

# Import handler logic
from app.graph.nodes.parse_jd_node import parse_jd_node
from app.graph.nodes.count_node import count_node
from app.graph.nodes.screen_node import screen_node
from app.graph.nodes.jd_rewrite_node import jd_rewrite_node
from app.graph.nodes.interview_qgen_node import interview_qgen_node
from app.graph.nodes.salary_node import salary_node
from app.graph.nodes.hitl_confirm_node import hitl_confirm_node
from app.graph.nodes.fetch_jd_api_node import fetch_jd_api_node

# Phase 10 nodes
from app.graph.nodes.compare_node import compare_node
from app.graph.nodes.email_node import email_node
from app.graph.nodes.trend_node import trend_node
from app.graph.nodes.schedule_node import schedule_node
from app.graph.nodes.redflags_node import redflags_node

def supervisor_agent_node(state: RecruitState) -> dict:
    """
    Supervisor Agent.
    Coordinates incoming user requests, classifies intents via LLM router,
    and forwards tasks to the appropriate specialized sub-agent.
    """
    history = state.get("conversation_history", [])
    user_msg = history[-1]["content"] if history else ""
    
    # 1. Pre-classify the user query to see if it's a new task
    intent, confidence, resolved_candidate = route_and_log(user_msg, state)
    
    pending = state.get("pending_confirmation")
    
    # 2. Check if the user is replying to the confirmation or starting a brand new task
    import re
    cleaned_msg = user_msg.lower().strip()
    is_confirmation_reply = cleaned_msg in ["yes", "confirm", "y", "go ahead", "sure", "no", "cancel", "n", "discard", "edit"] or \
                             re.match(r"^(?:slot|option|number|pick|choose|select|go with)?\s*\d+\b", cleaned_msg)
                             
    if pending is not None and not is_confirmation_reply and confidence >= 0.85:
        # User explicitly issued a new command. Discard the old pending confirmation.
        pending = None
        
    if pending is not None:
        action = pending.get("action")
        if action == "schedule_interview":
            intent = "schedule"
        else:
            intent = "finalize_shortlist"
            
    return {
        "last_intent": intent,
        "pending_confirmation": pending
    }

def jd_agent_node(state: RecruitState) -> dict:
    """
    Specialized JD Agent.
    Handles job description loading, parsing, context rewriting, and live JD fetching.
    """
    intent = state.get("last_intent")
    if intent == "load_context":
        return parse_jd_node(state)
    elif intent == "rewrite_jd":
        return jd_rewrite_node(state)
    elif intent == "fetch_jd_api":
        return fetch_jd_api_node(state)
    return {}

def screening_agent_node(state: RecruitState) -> dict:
    """
    Specialized Screening & RAG Agent.
    Manages candidate count computations, advanced RAG screening matches,
    candidate comparison tables, and resume red-flag detection.
    """
    intent = state.get("last_intent")
    if intent == "screen":
        return screen_node(state)
    elif intent == "count":
        return count_node(state)
    elif intent == "compare":
        return compare_node(state)
    elif intent == "redflags":
        return redflags_node(state)
    return {}

def interview_salary_agent_node(state: RecruitState) -> dict:
    """
    Specialized Interview & Salary Agent.
    Generates technical prep questions, retrieves live salary metrics,
    drafts recruiter emails, analyzes skill trends, and schedules interviews.
    """
    intent = state.get("last_intent")
    if intent == "interview_questions":
        return interview_qgen_node(state)
    elif intent == "salary":
        return salary_node(state)
    elif intent == "email":
        return email_node(state)
    elif intent == "trend":
        return trend_node(state)
    elif intent == "schedule":
        return schedule_node(state)
    return {}

def fallback_node(state: RecruitState) -> dict:
    """
    Fallback Agent for out-of-scope or unclassified user turns.
    """
    history = state.get("conversation_history", [])
    content = (
        "I'm not quite sure how to help with that. Here are the things I can do for you:\n"
        "1. Load and parse a Job Description and candidate resumes (e.g. 'load JD and resumes')\n"
        "2. Count loaded resumes (e.g. 'how many candidates do we have?')\n"
        "3. Screen and rank candidates against the JD (e.g. 'screen candidates')\n"
        "4. Rewrite or polish the JD (e.g. 'rewrite this JD for a startup')\n"
        "5. Generate interview prep questions (e.g. 'interview questions for Alice')\n"
        "6. Check market salary ranges (e.g. 'salary range for this role')\n"
        "7. Finalize candidate shortlists (e.g. 'finalize the shortlist')\n\n"
        "Could you please clarify your request?"
    )
    return {
        "conversation_history": history + [{
            "role": "assistant",
            "content": content
        }]
    }

# Build LangGraph StateGraph
builder = StateGraph(RecruitState)

# Add Multi-Agent Nodes
builder.add_node("supervisor_agent", supervisor_agent_node)
builder.add_node("jd_agent", jd_agent_node)
builder.add_node("screening_agent", screening_agent_node)
builder.add_node("interview_salary_agent", interview_salary_agent_node)
builder.add_node("hitl_confirm", hitl_confirm_node)
builder.add_node("fallback", fallback_node)

builder.set_entry_point("supervisor_agent")

def route_to_subagent(state: RecruitState) -> str:
    """
    Supervisor conditional routing logic.
    """
    intent = state.get("last_intent")

    if intent in ["load_context", "rewrite_jd", "fetch_jd_api"]:
        return "jd_agent"
    elif intent in ["screen", "count", "compare", "redflags"]:
        return "screening_agent"
    elif intent in ["interview_questions", "salary", "email", "trend", "schedule"]:
        return "interview_salary_agent"
    elif intent == "finalize_shortlist":
        return "hitl_confirm"
    else:
        return "fallback"

# Conditional routing links
builder.add_conditional_edges(
    "supervisor_agent",
    route_to_subagent,
    {
        "jd_agent": "jd_agent",
        "screening_agent": "screening_agent",
        "interview_salary_agent": "interview_salary_agent",
        "hitl_confirm": "hitl_confirm",
        "fallback": "fallback"
    }
)

# Connect sub-agents to the END node
builder.add_edge("jd_agent", END)
builder.add_edge("screening_agent", END)
builder.add_edge("interview_salary_agent", END)
builder.add_edge("hitl_confirm", END)
builder.add_edge("fallback", END)

# Compile LangGraph
graph = builder.compile()
