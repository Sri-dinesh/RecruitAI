"""
Task 10.5 - Mock Calendar Scheduler Node
Generates 5 mock interview time slots for the next 5 business days.
Handles slot selection confirmations.
"""
import re
from datetime import datetime, timedelta
from typing import List, Optional, Tuple
from app.graph.state import RecruitState


BUSINESS_DAY_SLOTS = ["10:00 AM", "2:00 PM", "4:00 PM"]


def _next_business_days(n: int) -> List[datetime]:
    """Returns the next n business days (Mon-Fri) from today."""
    days = []
    current = datetime.now()
    while len(days) < n:
        current += timedelta(days=1)
        if current.weekday() < 5:  # Monday=0, Friday=4
            days.append(current)
    return days


def _generate_slots(n: int = 5) -> List[dict]:
    """
    Generates n mock interview time slots over the next business days.
    Returns a list of dicts with slot_number, date, time, label.
    """
    business_days = _next_business_days(5)
    slots = []
    idx = 1
    for day in business_days:
        for time_str in BUSINESS_DAY_SLOTS:
            if idx > n:
                break
            date_str = day.strftime("%A, %B %d %Y")
            slots.append({
                "slot_number": idx,
                "date": date_str,
                "time": time_str,
                "label": f"{date_str} at {time_str}"
            })
            idx += 1
        if idx > n:
            break
    return slots


def _extract_candidate_name(query: str, state: RecruitState) -> Optional[str]:
    """Extracts candidate name from query or falls back to shortlist top candidate."""
    resumes = state.get("resumes", [])
    q = query.lower()

    for candidate in resumes:
        first_name = candidate.name.split()[0].lower()
        full_name = candidate.name.lower()
        if (re.search(rf"\b{re.escape(first_name)}\b", q) or
                re.search(rf"\b{re.escape(full_name)}\b", q)):
            return candidate.name

    shortlist = state.get("last_shortlist")
    if shortlist:
        return shortlist[0].name

    # Try regex for any capitalized name
    match = re.search(r"\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)", query)
    if match:
        return match.group(1)

    return None


def _extract_slot_number(query: str) -> Optional[int]:
    """
    Checks if the user is selecting a slot number (e.g., '1', '2', 'slot 3', 'option 2').
    Returns the integer slot number or None.
    """
    # Match patterns like "1", "slot 2", "option 3", "number 4", "pick 1"
    match = re.search(r"\b(?:slot|option|number|pick|choose|select|go with)?\s*([1-5])\b", query.lower())
    if match:
        return int(match.group(1))
    return None


def schedule_node(state: RecruitState) -> dict:
    """
    Mock Calendar Scheduler Node.
    - On first call: generates 5 mock time slots and stores pending_confirmation.
    - On follow-up (user picks a slot): confirms the booking and clears pending.
    """
    history = state.get("conversation_history", [])
    user_msg = history[-1]["content"] if history else ""
    pending = state.get("pending_confirmation")

    # --- CASE 1: We have a pending schedule confirmation, process slot selection ---
    if pending and pending.get("action") == "schedule_interview":
        slot_number = _extract_slot_number(user_msg)
        slots = pending.get("slots", [])
        candidate_name = pending.get("candidate_name", "the candidate")

        if slot_number and 1 <= slot_number <= len(slots):
            chosen = slots[slot_number - 1]
            label = chosen["label"]

            # Record the interview
            scheduled_interviews = state.get("scheduled_interviews") or []
            new_interview = {
                "candidate_name": candidate_name,
                "slot": label,
                "booked_at": datetime.now().isoformat()
            }

            confirmation_msg = (
                f"### ✅ Interview Scheduled!\n\n"
                f"**Candidate:** {candidate_name}\n"
                f"**Date & Time:** {label}\n\n"
                f"*A calendar invite and confirmation email would be sent in production.*"
            )

            return {
                "pending_confirmation": None,
                "scheduled_interviews": scheduled_interviews + [new_interview],
                "conversation_history": history + [{
                    "role": "assistant",
                    "content": confirmation_msg
                }]
            }
        else:
            # Invalid slot selection
            slot_list = "\n".join(
                f"{s['slot_number']}. {s['label']}"
                for s in slots
            )
            return {
                "conversation_history": history + [{
                    "role": "assistant",
                    "content": (
                        f"Please select a valid slot number (1-{len(slots)}):\n\n"
                        f"{slot_list}"
                    )
                }]
            }

    # --- CASE 2: New scheduling request - generate slots ---
    candidate_name = _extract_candidate_name(user_msg, state)
    jd = state.get("jd_structured")
    role = jd.role if jd else "the position"

    slots = _generate_slots(5)

    # Format slot list
    slot_lines = [
        f"### 📅 Interview Slots for **{candidate_name or 'Candidate'}** — {role}\n",
        "Please select a time slot by replying with the slot number:\n"
    ]
    for slot in slots:
        slot_lines.append(f"**{slot['slot_number']}.** {slot['label']}")

    slot_lines.append("\n*Reply with a number (1–5) to confirm the booking.*")

    pending_data = {
        "action": "schedule_interview",
        "candidate_name": candidate_name or "Candidate",
        "role": role,
        "slots": slots
    }

    return {
        "pending_confirmation": pending_data,
        "conversation_history": history + [{
            "role": "assistant",
            "content": "\n".join(slot_lines)
        }]
    }
