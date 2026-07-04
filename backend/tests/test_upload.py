import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app
from app.schemas.candidate_schema import Candidate

client = TestClient(app)

mock_candidate = Candidate(
    candidate_id="john_doe",
    name="John Doe",
    raw_text="John Doe resume content. Experienced Python Developer.",
    match_score=0,
    matched_skills=[],
    gaps=[]
)

@patch("app.api.routes_ingest.ingest_single_candidate_text", return_value=mock_candidate)
def test_upload_txt_file(mock_ingest):
    # Test uploading a valid plain text resume
    file_content = b"John Doe resume content. Experienced Python Developer."
    files = {"files": ("john_doe.txt", file_content, "text/plain")}
    
    response = client.post("/api/ingest/upload", files=files)
    assert response.status_code == 200
    
    data = response.json()
    assert len(data) == 1
    assert data[0]["candidate_id"] == "john_doe"
    assert data[0]["name"] == "John Doe"
    
    # Assert parser resolved name and ID correctly
    mock_ingest.assert_called_once()
    args = mock_ingest.call_args[0]
    assert args[0] == "john_doe"
    assert args[1] == "John Doe"
    assert "Experienced Python Developer." in args[2]

@patch("app.api.routes_ingest.ingest_single_candidate_text", return_value=mock_candidate)
def test_upload_unsupported_format(mock_ingest):
    # Test uploading an unsupported format (e.g. image)
    files = {"files": ("photo.png", b"fake-png-binary-data", "image/png")}
    
    response = client.post("/api/ingest/upload", files=files)
    assert response.status_code == 400
    assert "Unsupported file format" in response.json()["detail"]
    assert mock_ingest.call_count == 0


@patch("app.api.routes_ingest.call_llm")
def test_upload_jd_txt(mock_call_llm):
    # Mock LLM response for parsed JD
    mock_call_llm.return_value = (
        '{"role": "Senior Fullstack Engineer", "required_skills": ["Python", "React"], "experience_years": 6}',
        "mock_provider",
        15
    )
    
    file_content = b"We are looking for a Senior Fullstack Engineer skilled in Python and React."
    files = {"file": ("jd.txt", file_content, "text/plain")}
    
    response = client.post("/api/ingest/upload-jd", files=files)
    assert response.status_code == 200
    
    data = response.json()
    assert data["role"] == "Senior Fullstack Engineer"
    assert data["required_skills"] == ["Python", "React"]
    assert data["experience_years"] == 6
    assert "Python and React" in data["raw_text"]
    mock_call_llm.assert_called_once()

