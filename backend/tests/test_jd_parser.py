import pytest
from app.services.jd_parser import parse_structured_jd

def test_parse_structured_jd_complete_text():
    raw_text = """
    Job Title: Senior Backend Engineer
    Company: TechCorp Solutions
    Location: San Francisco, CA (Hybrid)
    Employment Type: Full-time
    Salary: $150,000 - $180,000 / year
    Experience: 5+ years
    Education: Bachelor's degree in Computer Science
    
    About the Role:
    We are looking for a Senior Backend Engineer to build scalable microservices.
    
    Must-Have Skills:
    - Python
    - FastAPI
    - PostgreSQL
    - Docker
    
    Nice-to-Have Skills:
    - Kubernetes
    - Redis
    
    Key Responsibilities:
    - Design REST APIs
    - Optimize database queries
    """
    
    jd = parse_structured_jd(raw_text)
    assert "Backend" in jd.role
    assert "Python" in jd.required_skills or "FastAPI" in jd.required_skills
    assert jd.experience_years >= 5
    assert jd.raw_text == raw_text.strip()

def test_parse_structured_jd_minimal_text():
    raw_text = "We need a React developer with TypeScript knowledge for 3 years experience."
    jd = parse_structured_jd(raw_text, filename="react_developer.pdf")
    assert jd.role != ""
    assert len(jd.required_skills) > 0
    assert jd.experience_years == 3

def test_parse_structured_jd_empty():
    jd = parse_structured_jd("", filename="junior_dev.pdf")
    assert jd.role == "Junior Dev"
    assert len(jd.required_skills) > 0
