from uuid import UUID
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client
from app.api.deps import get_current_user_id, get_supabase_client
from app.schemas.projects import ProjectCreate, ProjectResponse, ProjectUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])


def _err(exc: Exception):
    logger.exception("Project operation failed: %s", exc)
    raise HTTPException(status_code=500, detail="Project operation failed") from exc


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(payload: ProjectCreate, user_id: str = Depends(get_current_user_id), supabase: Client = Depends(get_supabase_client)):
    try:
        response = supabase.table("projects").insert({"owner_id": user_id, "name": payload.name, "description": payload.description, "settings": payload.settings}).select("*").single().execute()
    except Exception as exc:
        _err(exc)
    return ProjectResponse.model_validate(response.data)


@router.get("", response_model=list[ProjectResponse])
def list_projects(user_id: str = Depends(get_current_user_id), supabase: Client = Depends(get_supabase_client)):
    try:
        response = supabase.table("projects").select("*").eq("owner_id", user_id).order("created_at", desc=True).execute()
    except Exception as exc:
        _err(exc)
    return [ProjectResponse.model_validate(r) for r in (response.data or [])]


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: UUID, user_id: str = Depends(get_current_user_id), supabase: Client = Depends(get_supabase_client)):
    try:
        response = supabase.table("projects").select("*").eq("id", str(project_id)).eq("owner_id", user_id).maybe_single().execute()
    except Exception as exc:
        _err(exc)
    if not response.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse.model_validate(response.data)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: UUID, payload: ProjectUpdate, user_id: str = Depends(get_current_user_id), supabase: Client = Depends(get_supabase_client)):
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="At least one field is required")
    try:
        response = supabase.table("projects").update(changes).eq("id", str(project_id)).eq("owner_id", user_id).select("*").maybe_single().execute()
    except Exception as exc:
        _err(exc)
    if not response.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse.model_validate(response.data)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: UUID, user_id: str = Depends(get_current_user_id), supabase: Client = Depends(get_supabase_client)):
    try:
        response = supabase.table("projects").delete().eq("id", str(project_id)).eq("owner_id", user_id).select("id").maybe_single().execute()
    except Exception as exc:
        _err(exc)
    if not response.data:
        raise HTTPException(status_code=404, detail="Project not found")
