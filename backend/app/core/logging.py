import json
import time
from pathlib import Path
from typing import Optional

# Structured logs folder and file
BASE_DIR = Path(__file__).resolve().parent.parent.parent
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "trace.jsonl"

_current_turn = 0

def increment_turn() -> int:
    global _current_turn
    _current_turn += 1
    return _current_turn

def get_current_turn() -> int:
    return _current_turn

def log_event(intent: str, confidence: float, provider: str, latency_ms: float, node: str, extra: Optional[dict] = None) -> dict:
    """
    Logs a structured JSON line tracing an agent step.
    Format:
    {
      "turn": 4,
      "intent": "screen",
      "confidence": 0.91,
      "provider": "groq",
      "latency_ms": 1340,
      "node": "screen_node"
    }
    """
    event = {
        "turn": _current_turn,
        "intent": intent,
        "confidence": confidence,
        "provider": provider,
        "latency_ms": int(latency_ms),
        "node": node,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    if extra:
        event.update(extra)
        
    # Write to JSONL log file
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")
        
    return event

def get_all_logs() -> list:
    """
    Reads all logged events from trace.jsonl (useful for demo trace view).
    """
    if not LOG_FILE.exists():
        return []
    logs = []
    with open(LOG_FILE, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                logs.append(json.loads(line.strip()))
    return logs
