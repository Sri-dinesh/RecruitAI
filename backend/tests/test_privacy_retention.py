"""
backend/tests/test_privacy_retention.py
---------------------------------------
Unit tests for AI-SEC-3: GDPR Art. 15/20 data export, Art. 17 right-to-erasure cascade,
and automated tiered data retention schedules.
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import get_current_user_id
from app.rag.vector_store import get_supabase_client

client = TestClient(app)
TEST_USER_ID = "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3"


@pytest.fixture(autouse=True)
def setup_test_env():
    import app.rag.vector_store as vs
    old_flag = vs._use_local_sqlite
    vs._use_local_sqlite = True
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID
    yield
    vs._use_local_sqlite = old_flag
    app.dependency_overrides = {}


def test_gdpr_export_and_erasure_lifecycle():
    client_db = get_supabase_client()
    cand_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    # 1. Seed candidate, job, application, interview, and vector chunks
    client_db.table("candidates").insert({
        "id": cand_id,
        "user_id": TEST_USER_ID,
        "full_name": "Oliver Queen",
        "email": "oliver@queenindustries.com",
        "phone": "+1-555-123-4567",
        "raw_resume_text": "Experienced CEO & Archer",
        "metadata": {"skills": ["Archery", "Leadership"]}
    }).execute()

    client_db.table("jobs").insert({
        "id": job_id,
        "user_id": TEST_USER_ID,
        "title": "Chief Executive",
        "raw_jd": "CEO Wanted"
    }).execute()

    client_db.table("applications").insert({
        "job_id": job_id,
        "candidate_id": cand_id,
        "user_id": TEST_USER_ID,
        "match_score": 95.0,
        "status": "shortlisted"
    }).execute()

    client_db.table("interviews").insert({
        "candidate_id": cand_id,
        "user_id": TEST_USER_ID,
        "scheduled_at": "2026-10-01T10:00:00Z",
        "mode": "video",
        "status": "scheduled"
    }).execute()

    client_db.table("resume_chunks").insert({
        "candidate_id": cand_id,
        "user_id": TEST_USER_ID,
        "chunk_text": "Executive leadership chunk",
        "chunk_index": 0
    }).execute()

    # 2. Test GDPR Art. 15/20 Export endpoint
    export_res = client.get(f"/api/privacy/export/{cand_id}")
    assert export_res.status_code == 200
    export_data = export_res.json()
    assert export_data["candidate"]["id"] == cand_id
    assert export_data["candidate"]["full_name"] == "Oliver Queen"
    assert len(export_data["applications"]) == 1
    assert len(export_data["interviews"]) == 1
    assert export_data["vector_chunks_stored"] == 1
    assert export_data["export_metadata"]["gdpr_compliance"] == "Articles 15 & 20"

    # 3. Test GDPR Art. 17 Right-to-Erasure endpoint
    delete_res = client.delete(f"/api/privacy/candidates/{cand_id}")
    assert delete_res.status_code == 200
    assert delete_res.json()["success"] is True

    # 4. Verify complete transactional cascade deletion
    c_check = client_db.table("candidates").select("id").eq("id", cand_id).execute()
    assert len(c_check.data or []) == 0

    app_check = client_db.table("applications").select("id").eq("candidate_id", cand_id).execute()
    assert len(app_check.data or []) == 0

    int_check = client_db.table("interviews").select("id").eq("candidate_id", cand_id).execute()
    assert len(int_check.data or []) == 0

    chunk_check = client_db.table("resume_chunks").select("id").eq("candidate_id", cand_id).execute()
    assert len(chunk_check.data or []) == 0


def test_retention_policy_endpoint():
    # Test automated retention policy endpoint
    retention_res = client.post("/api/privacy/retention/run", json={
        "raw_resume_ttl_days": 90,
        "chat_ttl_days": 365
    })
    assert retention_res.status_code == 200
    res_json = retention_res.json()
    assert res_json["success"] is True
    assert "raw_resumes_cleared" in res_json["summary"]
    assert "chat_messages_purged" in res_json["summary"]
