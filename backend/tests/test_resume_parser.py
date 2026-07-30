import pytest
from app.services.resume_parser import parse_structured_resume

def test_parse_structured_resume():
    raw_text = """
    John Doe
    Senior Python Engineer | Cloud Architect
    Email: john.doe@example.com
    Phone: +1 555-123-4567
    Location: San Francisco, CA
    Website: https://johndoe.dev
    
    Summary:
    Experienced Python and FastAPI backend developer with 6 years experience building cloud applications.
    
    Skills:
    - Python, FastAPI, Django, PostgreSQL, Docker, AWS, React, Kubernetes
    
    Education:
    - B.S. in Computer Science, Stanford University
    """
    
    candidate = parse_structured_resume(raw_text, filename="john_doe_resume.pdf")
    assert "John Doe" in candidate.name
    assert candidate.email == "john.doe@example.com"
    assert candidate.phone == "+1 555-123-4567"
    assert "https://johndoe.dev" in candidate.links
    assert candidate.experience_years >= 5
    assert len(candidate.skills) > 0
    assert "Python" in candidate.skills or "FastAPI" in candidate.skills

def test_parse_structured_resume_minimal():
    raw_text = "Jane Smith\nPython Developer with 4 years experience."
    candidate = parse_structured_resume(raw_text, filename="jane_smith.txt")
    assert candidate.name != ""
    assert candidate.experience_years == 4
