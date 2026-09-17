import pytest
import uuid
import json
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import get_current_user_id
from app.schemas.candidate_schema import Candidate
from app.schemas.jd_schema import JobDescription

client = TestClient(app)

TEST_USER_ID = "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3"

@pytest.fixture(autouse=True)
def setup_test_env():
    import app.rag.vector_store as vs
    import app.core.config as cfg
    old_flag = vs._use_local_sqlite
    old_auth = cfg.USE_LOCAL_AUTH
    vs._use_local_sqlite = True
    cfg.USE_LOCAL_AUTH = True
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID
    yield
    vs._use_local_sqlite = old_flag
    cfg.USE_LOCAL_AUTH = old_auth
    app.dependency_overrides = {}


# =====================================================================
# 1. routes_chat.py API Surface Contract Tests (ENG-3)
# =====================================================================

def test_chat_contract_missing_message_returns_422():
    """Verify request schema validation rejects payloads missing required 'message' field."""
    res = client.post("/api/chat", json={})
    assert res.status_code == 422
    errors = res.json()["detail"]
    assert any("message" in str(e["loc"]) for e in errors)


def test_chat_contract_response_schema():
    """Verify ChatResponse adheres strictly to the contract schema."""
    mock_result = {
        "conversation_history": [
            {"role": "user", "content": "hello agent"},
            {"role": "assistant", "content": "Hello! How can I assist your recruiting today?"}
        ],
        "jd_structured": {
            "role": "Senior Frontend Developer",
            "required_skills": ["React", "TypeScript"],
            "experience_years": 4,
            "raw_text": "Senior frontend developer JD"
        },
        "resumes": [],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": "greeting",
        "scheduled_interviews": []
    }

    with patch("app.api.routes_chat.graph.invoke", return_value=mock_result):
        res = client.post("/api/chat", json={"message": "hello agent"})
        assert res.status_code == 200
        data = res.json()
        assert "response" in data
        assert isinstance(data["response"], str)
        assert "conversation_history" in data
        assert isinstance(data["conversation_history"], list)
        assert len(data["conversation_history"]) == 2
        assert "jd_structured" in data
        assert data["jd_structured"]["role"] == "Senior Frontend Developer"
        assert "resumes" in data
        assert "last_shortlist" in data
        assert "last_intent" in data
        assert data["last_intent"] == "greeting"


def test_chat_contract_async_mode_202_accepted():
    """Verify contract for async job dispatch: returns 202 Accepted with job_id and queued status."""
    mock_result = {
        "conversation_history": [
            {"role": "user", "content": "long task"},
            {"role": "assistant", "content": "done"}
        ],
        "jd_structured": None,
        "resumes": [],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": "greeting",
        "scheduled_interviews": []
    }

    with patch("app.api.routes_chat.graph.invoke", return_value=mock_result):
        res = client.post("/api/chat", json={
            "message": "long task",
            "async_mode": True,
            "idempotency_key": f"idem-{uuid.uuid4()}"
        })
        assert res.status_code == 202
        data = res.json()
        assert "job_id" in data
        assert data["status"] == "queued"


# =====================================================================
# 2. routes_ingest.py Multi-File Partial Failure Semantics (ENG-3)
# =====================================================================

def test_ingest_contract_all_success_returns_200():
    """Verify all valid files upload returns HTTP 200 with list of candidates."""
    mock_cand = Candidate(
        candidate_id="cand_test_success",
        name="Valid Candidate",
        raw_text="Experienced engineer resume.",
        match_score=85
    )
    with patch("app.api.routes_ingest.ingest_candidate_object", return_value=mock_cand):
        with patch("app.services.resume_api.call_llm", return_value=('{"name": "Valid Candidate"}', "mock", 10)):
            res = client.post(
                "/api/ingest/upload",
                files=[
                    ("files", ("cand1.txt", b"Resume text 1", "text/plain")),
                    ("files", ("cand2.txt", b"Resume text 2", "text/plain"))
                ]
            )
            assert res.status_code == 200
            data = res.json()
            assert len(data) == 2
            assert all(c["candidate_id"] == "cand_test_success" for c in data)


def test_ingest_contract_partial_failure_returns_207_multi_status():
    """Verify batch upload with 1 valid and 1 invalid file yields RFC 4918 HTTP 207 Multi-Status."""
    mock_cand = Candidate(
        candidate_id="cand_valid_item",
        name="Alice Valid",
        raw_text="Alice valid resume.",
        match_score=90
    )
    with patch("app.api.routes_ingest.ingest_candidate_object", return_value=mock_cand):
        with patch("app.services.resume_api.call_llm", return_value=('{"name": "Alice Valid"}', "mock", 10)):
            res = client.post(
                "/api/ingest/upload",
                files=[
                    ("files", ("alice.txt", b"Alice resume content", "text/plain")),
                    ("files", ("malware.sh", b"#!/bin/bash echo bad", "application/x-sh"))
                ]
            )
            assert res.status_code == 207
            items = res.json()
            assert len(items) == 2

            alice_item = next(i for i in items if i["filename"] == "alice.txt")
            assert alice_item["status"] == "success"
            assert alice_item["candidate_id"] == "cand_valid_item"

            bad_item = next(i for i in items if i["filename"] == "malware.sh")
            assert bad_item["status"] == "failed"
            assert "Unsupported file format" in bad_item["error"]


# =====================================================================
# 3. routes_evaluate.py Candidate Status & ATS Export Coverage (ENG-3)
# =====================================================================

def test_candidate_status_persistence_contract():
    """Verify POST /candidates/{id}/status persists status and updates applications table."""
    from app.rag.vector_store import get_supabase_client
    client_db = get_supabase_client()
    cand_id = str(uuid.uuid4())

    # Seed candidate
    client_db.table("candidates").insert({
        "id": cand_id,
        "user_id": TEST_USER_ID,
        "full_name": "Diana Prince",
        "email": "diana@themyscira.com",
        "metadata": json.dumps({"status": "new", "match_score": 95})
    }).execute()

    # Human recruiter updates status to 'shortlisted'
    res = client.post(
        f"/api/candidates/{cand_id}/status",
        json={"status": "shortlisted", "actor": "human_recruiter"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["candidate_id"] == cand_id
    assert data["new_status"] == "shortlisted"

    # Verify candidates table updated
    c_check = client_db.table("candidates").select("metadata").eq("id", cand_id).execute()
    meta = c_check.data[0]["metadata"]
    if isinstance(meta, str):
        meta = json.loads(meta)
    assert meta["status"] == "shortlisted"


def test_candidate_status_gdpr_art22_adverse_decision_blocked():
    """Verify automated agent is blocked from setting status='rejected' under GDPR Art. 22."""
    cand_id = str(uuid.uuid4())
    res = client.post(
        f"/api/candidates/{cand_id}/status",
        json={"status": "rejected", "actor": "automated_agent"}
    )
    assert res.status_code == 403
    assert "GDPR Art. 22 Violation" in res.json()["detail"]


def test_export_ats_formats_contract():
    """Verify ATS export endpoints return structured JSON and CSV formats."""
    res_json = client.post("/api/export/ats", json={"format": "json"})
    assert res_json.status_code == 200
    data = res_json.json()
    assert data["status"] == "success"
    assert "evaluations" in data
    assert isinstance(data["evaluations"], dict)

    res_csv = client.post("/api/export/ats", json={"format": "csv"})
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers.get("content-type", "")
    assert "Candidate ID" in res_csv.text


# =====================================================================
# 4. ingestion_service.py Metadata JSON Serialization (BUG-1 Regression)
# =====================================================================

def test_metadata_json_serialization_regression_bug1():
    """
    BUG-1 Regression test: Ensure dict and list types in candidate metadata
    are correctly serialized without string concatenation errors or missing imports.
    """
    from app.services.ingestion_service import upsert_candidate_record
    from app.rag.vector_store import get_supabase_client

    test_cand = Candidate(
        candidate_id=str(uuid.uuid4()),
        name="Ada Lovelace",
        email="ada.lovelace@analytical-engine.org",
        skills=["Algorithms", "Mathematics", "Architecture"],
        work_experience=["Lead Mathematician at Babbage Analytical Engine"],
        education=["Private Tutoring in Advanced Mathematics"],
        raw_text="Ada Lovelace pioneer of computer programming algorithms.",
        match_score=99,
        matched_skills=["Algorithms", "Architecture"],
        gaps=[],
        consent_version="2.0",
        source="direct_upload"
    )

    cand_id = upsert_candidate_record(test_cand, user_id=TEST_USER_ID, session_id="session-contract-1")
    assert cand_id is not None

    client_db = get_supabase_client()
    row_res = client_db.table("candidates").select("*").eq("id", cand_id).execute()
    assert row_res.data
    row = row_res.data[0]

    # Verify metadata is valid JSON
    meta_raw = row["metadata"]
    assert meta_raw is not None
    if isinstance(meta_raw, str):
        meta_dict = json.loads(meta_raw)
    else:
        meta_dict = meta_raw

    assert meta_dict["skills"] == ["Algorithms", "Mathematics", "Architecture"]
    assert meta_dict["work_experience"] == ["Lead Mathematician at Babbage Analytical Engine"]
    assert meta_dict["education"] == ["Private Tutoring in Advanced Mathematics"]
    assert meta_dict["matched_skills"] == ["Algorithms", "Architecture"]
    assert meta_dict["consent_version"] == "2.0"
    assert meta_dict["source"] == "direct_upload"
    assert "resume_hash" in meta_dict
    assert "session_ids" in meta_dict
    assert "session-contract-1" in meta_dict["session_ids"]
