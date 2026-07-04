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

def supervisor_agent_node(state: RecruitState) -> dict:
    """
    Supervisor Agent.
    Coordinates incoming user requests, classifies intents via LLM router,
    and forwards tasks to the appropriate specialized sub-agent.
    """
    history = state.get("conversation_history", [])
    user_msg = history[-1]["content"] if history else ""
    
    # Bypass routing if there is a pending human-in-the-loop confirmation
    if state.get("pending_confirmation") is not None:
        intent = "finalize_shortlist"
    else:
        intent, confidence, resolved_candidate = route_and_log(user_msg, state)
        
    return {
        "last_intent": intent
    }

def jd_agent_node(state: RecruitState) -> dict:
    """
    Specialized JD Agent.
    Handles job description loading, parsing, and context rewriting.
    """
    intent = state.get("last_intent")
    if intent == "load_context":
        return parse_jd_node(state)
    elif intent == "rewrite_jd":
        return jd_rewrite_node(state)
    return {}

def screening_agent_node(state: RecruitState) -> dict:
    """
    Specialized Screening & RAG Agent.
    Manages candidate count computations and advanced RAG screening matches.
    """
    intent = state.get("last_intent")
    if intent == "screen":
        return screen_node(state)
    elif intent == "count":
        return count_node(state)
    return {}

def interview_salary_agent_node(state: RecruitState) -> dict:
    """
    Specialized Interview & Salary Agent.
    Generates technical prep questions and retrieves live salary metrics.
    """
    intent = state.get("last_intent")
    if intent == "interview_questions":
        return interview_qgen_node(state)
    elif intent == "salary":
        return salary_node(state)
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
    
    if intent in ["load_context", "rewrite_jd"]:
        return "jd_agent"
    elif intent in ["screen", "count"]:
        return "screening_agent"
    elif intent in ["interview_questions", "salary"]:
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
