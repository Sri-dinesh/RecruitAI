import os
import json
import requests
from pathlib import Path
from app.core.config import TAVILY_API_KEY
from typing import Tuple

FALLBACK_FILE = Path(__file__).resolve().parent.parent / "data" / "salary_fallback.json"

def search_salary_data(role: str, location: str = "India") -> Tuple[str, bool]:
    """
    Queries Tavily for salary details using a strict 5-second timeout.
    If Tavily is unavailable or times out, falls back to local cached data.
    Returns (result_text, is_live_data).
    """
    query = f"salary expectations range benchmarks for '{role}' in {location} 2026"
    
    tavily_active = bool(TAVILY_API_KEY) and "your_tavily" not in TAVILY_API_KEY
    
    if tavily_active:
        try:
            # We call the Tavily search endpoint directly with a 5.0 second timeout
            response = requests.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": query,
                    "search_depth": "basic",
                    "max_results": 3
                },
                timeout=5.0
            )
            if response.status_code == 200:
                data = response.json()
                results = data.get("results", [])
                if results:
                    summary_lines = []
                    for r in results:
                        title = r.get("title", "Salary Source")
                        content = r.get("content", "")
                        url = r.get("url", "")
                        summary_lines.append(f"- **{title}**: {content}\n  Source: {url}")
                    return "\n\n".join(summary_lines), True
        except Exception as e:
            print(f"[Tavily Search] failed or timed out: {e}. Falling back to cached data...")
            
    # Fallback to local salary_fallback.json
    try:
        if FALLBACK_FILE.exists():
            with open(FALLBACK_FILE, "r", encoding="utf-8") as f:
                cached_data = json.load(f)
                
            matched = None
            role_lower = role.lower()
            
            # Find entry that matches role and location
            for entry in cached_data:
                entry_role = entry["role"].lower()
                if (entry_role in role_lower or role_lower in entry_role) and entry["location"].lower() == location.lower():
                    matched = entry
                    break
                    
            # Fallback to match by role only if location match fails
            if not matched:
                for entry in cached_data:
                    entry_role = entry["role"].lower()
                    if entry_role in role_lower or role_lower in entry_role:
                        matched = entry
                        break
                        
            if matched:
                formatted_salary = f"{matched['min_salary']:,} - {matched['max_salary']:,} {matched['currency']}"
                fallback_str = (
                    f"Cached salary information for **{matched['role']}** in **{matched['location']}**:\n"
                    f"- Range: **{formatted_salary}** per annum."
                )
                return fallback_str, False
    except Exception as e:
        print(f"Error reading fallback salary data: {e}")
        
    # Final generic fallback if even JSON read fails
    return f"Estimated salary range for '{role}' in {location}: ₹1,200,000 - ₹2,500,000 INR per annum.", False
