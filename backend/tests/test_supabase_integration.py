import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from supabase import create_client

from app.api.deps import get_current_user_id, get_supabase_client
from app.main import app


@pytest.mark.integration
def test_create_project_and_delete_conversation_against_staging_supabase():
    """Exercise the real HTTP endpoints against the configured test/staging Supabase project."""
    supabase_url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    test_user_id = os.environ.get("TEST_SUPABASE_USER_ID")
    if not all((supabase_url, service_role_key, test_user_id)):
        pytest.fail(
            "Integration gate requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, "
            "and TEST_SUPABASE_USER_ID"
        )

    client = create_client(supabase_url, service_role_key)
    app.dependency_overrides[get_supabase_client] = lambda: client
    app.dependency_overrides[get_current_user_id] = lambda: test_user_id
    http = TestClient(app)

    project_id = None
    conversation_id = None
    try:
        project_response = http.post(
            "/projects",
            json={
                "name": f"CI project {uuid4().hex[:10]}",
                "description": "Created by CI integration test",
                "settings": {"ci": True},
            },
        )
        assert project_response.status_code in (200, 201), project_response.text
        project = project_response.json()
        project_id = project["id"]

        conversation = (
            client.table("conversations")
            .insert(
                {
                    "project_id": project_id,
                    "mode": "full",
                    "title": "CI delete test",
                    "result": {"ci": True},
                }
            )
            .execute()
        )
        assert conversation.data, "Failed to seed CI conversation"
        conversation_id = conversation.data[0]["id"]

        delete_response = http.delete(f"/history/{conversation_id}")
        assert delete_response.status_code == 204, delete_response.text

        deleted = (
            client.table("conversations")
            .select("id")
            .eq("id", conversation_id)
            .limit(1)
            .execute()
        )
        assert not (deleted.data or [])
    finally:
        app.dependency_overrides.clear()
        if conversation_id:
            client.table("conversations").delete().eq("id", conversation_id).execute()
        if project_id:
            client.table("projects").delete().eq("id", project_id).execute()
