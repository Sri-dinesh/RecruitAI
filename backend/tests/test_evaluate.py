import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_save_and_get_candidate_evaluation():
    payload = {
        "candidate_id": "cand_999",
        "tech_score": 5,
        "comm_score": 4,
        "notes": "Excellent candidate with strong Next.js and Python experience."
    }
    res = client.post("/api/candidates/evaluate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["evaluation"]["tech_score"] == 5

    res_get = client.get("/api/candidates/cand_999/evaluation")
    assert res_get.status_code == 200
    get_data = res_get.json()
    assert get_data["candidate_id"] == "cand_999"
    assert get_data["tech_score"] == 5
    assert get_data["comm_score"] == 4
    assert "Next.js" in get_data["notes"]

def test_export_ats_endpoint():
    res = client.post("/api/export/ats", json={"format": "json"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "evaluations" in data
