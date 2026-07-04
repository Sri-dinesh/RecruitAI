from app.graph.state import RecruitState

def hitl_confirm_node(state: RecruitState) -> dict:
    """
    Human-in-the-Loop (HITL) confirmation node.
    Manages double-check gates for critical actions (finalize_shortlist, replace_jd).
    Supports yes/no/edit flows and updates candidate shortlists dynamically based on edits.
    """
    history = state.get("conversation_history", [])
    user_msg = history[-1]["content"].strip().lower() if history else ""
    pending = state.get("pending_confirmation")
    
    # --- Case 1: We are initiating a confirmation request ---
    if not pending:
        shortlist = state.get("last_shortlist")
        if not shortlist:
            return {
                "conversation_history": history + [{
                    "role": "assistant",
                    "content": "No shortlist has been screened yet. Please ask me to screen candidates first."
                }]
            }
            
        names = [c.name for c in shortlist]
        pending_data = {
            "action": "finalize_shortlist",
            "payload": [c.candidate_id for c in shortlist]
        }
        
        confirm_msg = (
            f"You're about to finalize {len(shortlist)} candidates: {', '.join(names)}.\n"
            f"Confirm? (yes/no/edit)"
        )
        return {
            "pending_confirmation": pending_data,
            "conversation_history": history + [{
                "role": "assistant",
                "content": confirm_msg
            }]
        }
        
    # --- Case 2: We have a pending confirmation and are processing the user response ---
    action = pending.get("action")
    payload = pending.get("payload")
    
    # 2.1 User confirms "yes"
    if user_msg in ["yes", "confirm", "y", "go ahead", "sure"]:
        if action == "finalize_shortlist":
            resumes = state.get("resumes", [])
            committed_names = []
            for cid in payload:
                c = next((cand for cand in resumes if cand.candidate_id == cid), None)
                if c:
                    committed_names.append(c.name)
                    
            content = f"✅ **Shortlist Finalized**: Locked in {len(committed_names)} candidates: {', '.join(committed_names)}."
            return {
                "pending_confirmation": None,
                "conversation_history": history + [{
                    "role": "assistant",
                    "content": content
                }]
            }
            
        elif action == "replace_jd":
            from app.schemas.jd_schema import JobDescription
            new_jd = JobDescription(**payload)
            content = f"✅ **Job Description Updated**: Successfully set active JD to **{new_jd.role}**."
            return {
                "jd_structured": new_jd,
                "pending_confirmation": None,
                "conversation_history": history + [{
                    "role": "assistant",
                    "content": content
                }]
            }
            
    # 2.2 User rejects "no"
    elif user_msg in ["no", "cancel", "n", "discard"]:
        content = f"❌ **Cancelled**: Proposed changes for '{action}' have been discarded."
        return {
            "pending_confirmation": None,
            "conversation_history": history + [{
                "role": "assistant",
                "content": content
            }]
        }
        
    # 2.3 User wants to "edit" or provides specific exclusions
    elif "edit" in user_msg or "remove" in user_msg or "exclude" in user_msg or "except" in user_msg:
        if action == "finalize_shortlist":
            resumes = state.get("resumes", [])
            shortlist = state.get("last_shortlist") or []
            new_payload = []
            excluded_any = False
            
            # Simple keyword parsing to exclude names (e.g., "remove Bob", "remove Alice Smith")
            for cid in payload:
                c = next((cand for cand in resumes if cand.candidate_id == cid), None)
                if c:
                    first_name = c.name.split()[0].lower()
                    full_name = c.name.lower()
                    if f"remove {first_name}" in user_msg or f"remove {full_name}" in user_msg or f"exclude {first_name}" in user_msg or f"except {first_name}" in user_msg:
                        excluded_any = True
                        continue
                    new_payload.append(cid)
                    
            if excluded_any:
                new_shortlist = [c for c in shortlist if c.candidate_id in new_payload]
                names = [c.name for c in new_shortlist]
                
                pending_data = {
                    "action": "finalize_shortlist",
                    "payload": new_payload
                }
                
                confirm_msg = (
                    f"Updated shortlist. You're about to finalize {len(new_shortlist)} candidates: {', '.join(names)}.\n"
                    f"Confirm? (yes/no/edit)"
                )
                return {
                    "last_shortlist": new_shortlist,
                    "pending_confirmation": pending_data,
                    "conversation_history": history + [{
                        "role": "assistant",
                        "content": confirm_msg
                    }]
                }
                
        # If it's another type of action or we couldn't parse exclusions
        content = "Please reply with 'yes' to confirm, 'no' to cancel, or specify edits (e.g. 'remove Bob' for the shortlist)."
        return {
            "conversation_history": history + [{
                "role": "assistant",
                "content": content
            }]
        }
        
    # 2.4 Fallback/unrecognized response
    content = "I didn't quite catch that. Please reply with 'yes' to confirm, 'no' to cancel, or specify edits (e.g. 'remove Bob')."
    return {
        "conversation_history": history + [{
            "role": "assistant",
            "content": content
        }]
    }
