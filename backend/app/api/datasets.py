from __future__ import annotations

from pathlib import PurePosixPath
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from supabase import Client

from app.api.deps import get_current_user_id, get_supabase_client
from app.schemas.datasets import DatasetResponse, DatasetVersionResponse
from app.services.profiling import profile_bytes

router = APIRouter(prefix="/projects/{project_id}/datasets", tags=["datasets"])

_ALLOWED_EXTENSIONS = {".csv", ".xlsx"}
_MAX_FILE_SIZE = 100 * 1024 * 1024
_STORAGE_BUCKET = "datasets"


def _database_error(exc: Exception) -> None:
    raise HTTPException(status_code=500, detail="Dataset operation failed") from exc


def _require_project(project_id: UUID, user_id: str, supabase: Client) -> None:
    try:
        response = (
            supabase.table("projects")
            .select("id")
            .eq("id", str(project_id))
            .eq("owner_id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        _database_error(exc)

    if not response.data:
        raise HTTPException(status_code=404, detail="Project not found")


def _validate_upload(filename: str | None) -> str:
    suffix = PurePosixPath(filename or "").suffix.lower()
    if suffix not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload a CSV or XLSX file.",
        )
    return suffix


def _read_upload(upload: UploadFile, suffix: str) -> bytes:
    try:
        data = upload.file.read(_MAX_FILE_SIZE + 1)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read uploaded file") from exc

    if len(data) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 100 MB limit")
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    return data


def _profile_file(data: bytes, suffix: str) -> dict:
    try:
        result = profile_bytes(data, suffix)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file could not be parsed as a valid dataset",
        ) from exc

    if not result.valid:
        raise HTTPException(
            status_code=422,
            detail={"message": "Dataset failed validation", "errors": result.errors},
        )

    result.profile["warnings"] = result.warnings
    return result.profile


def _next_version(supabase: Client, dataset_id: UUID) -> int:
    try:
        response = (
            supabase.table("dataset_versions")
            .select("version_no")
            .eq("dataset_id", str(dataset_id))
            .order("version_no", desc=True)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        _database_error(exc)

    return int(response.data[0]["version_no"]) + 1 if response.data else 1


def _ingest_version(
    dataset_id: UUID,
    project_id: UUID,
    user_id: str,
    upload: UploadFile,
    supabase: Client,
) -> DatasetVersionResponse:
    suffix = _validate_upload(upload.filename)
    data = _read_upload(upload, suffix)
    profile = _profile_file(data, suffix)
    version_no = _next_version(supabase, dataset_id)
    version_id = uuid4()
    safe_name = PurePosixPath(upload.filename or f"dataset{suffix}").name
    storage_path = f"{user_id}/{project_id}/{dataset_id}/{version_no}/{safe_name}"

    row = {
        "id": str(version_id),
        "dataset_id": str(dataset_id),
        "version_no": version_no,
        "original_filename": safe_name,
        "storage_path": storage_path,
        "mime_type": upload.content_type,
        "size_bytes": len(data),
        "sheet_name": profile.get("sheet_name"),
        "detected_header_row": 0,
        "row_count": profile["row_count"],
        "column_count": profile["column_count"],
        "quality_score": profile["quality_score"],
        "profile": profile,
    }

    try:
        supabase.storage.from_(_STORAGE_BUCKET).upload(
            storage_path,
            data,
            {
                "content-type": upload.content_type or "application/octet-stream",
                "upsert": "false",
            },
        )
        response = (
            supabase.table("dataset_versions")
            .insert(row)
            .select("*")
            .single()
            .execute()
        )
        supabase.table("datasets").update({"current_version": version_no}).eq(
            "id", str(dataset_id)
        ).execute()
    except Exception as exc:
        try:
            supabase.storage.from_(_STORAGE_BUCKET).remove([storage_path])
        except Exception:
            pass
        _database_error(exc)

    return DatasetVersionResponse.model_validate(response.data)


@router.post("", response_model=DatasetResponse, status_code=201)
def create_dataset(
    project_id: UUID,
    file: UploadFile = File(...),
    name: str = Form(..., min_length=1, max_length=200),
    description: str | None = Form(default=None, max_length=2000),
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_client),
):
    _require_project(project_id, user_id, supabase)
    clean_name = name.strip()
    if not clean_name:
        raise HTTPException(status_code=422, detail="Name is required")

    # Validate and profile before creating the parent row so a bad upload cannot
    # leave an orphan dataset behind.
    suffix = _validate_upload(file.filename)
    data = _read_upload(file, suffix)
    profile = _profile_file(data, suffix)
    dataset_id = uuid4()
    version_no = 1
    safe_name = PurePosixPath(file.filename or f"dataset{suffix}").name
    storage_path = f"{user_id}/{project_id}/{dataset_id}/{version_no}/{safe_name}"
    version_id = uuid4()

    dataset_row = {
        "id": str(dataset_id),
        "project_id": str(project_id),
        "name": clean_name,
        "source_type": "upload",
        "description": description,
        "current_version": version_no,
    }
    version_row = {
        "id": str(version_id),
        "dataset_id": str(dataset_id),
        "version_no": version_no,
        "original_filename": safe_name,
        "storage_path": storage_path,
        "mime_type": file.content_type,
        "size_bytes": len(data),
        "sheet_name": profile.get("sheet_name"),
        "detected_header_row": 0,
        "row_count": profile["row_count"],
        "column_count": profile["column_count"],
        "quality_score": profile["quality_score"],
        "profile": profile,
    }

    try:
        supabase.table("datasets").insert(dataset_row).execute()
        supabase.storage.from_(_STORAGE_BUCKET).upload(
            storage_path,
            data,
            {
                "content-type": file.content_type or "application/octet-stream",
                "upsert": "false",
            },
        )
        supabase.table("dataset_versions").insert(version_row).execute()
        result = supabase.table("datasets").select("*").eq("id", str(dataset_id)).single().execute()
    except Exception as exc:
        try:
            supabase.storage.from_(_STORAGE_BUCKET).remove([storage_path])
        except Exception:
            pass
        try:
            supabase.table("dataset_versions").delete().eq("id", str(version_id)).execute()
        except Exception:
            pass
        try:
            supabase.table("datasets").delete().eq("id", str(dataset_id)).execute()
        except Exception:
            pass
        _database_error(exc)

    return DatasetResponse.model_validate(result.data)


@router.get("", response_model=list[DatasetResponse])
def list_datasets(
    project_id: UUID,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_client),
):
    _require_project(project_id, user_id, supabase)
    try:
        response = (
            supabase.table("datasets")
            .select("*")
            .eq("project_id", str(project_id))
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        _database_error(exc)
    return [DatasetResponse.model_validate(r) for r in (response.data or [])]


@router.get("/{dataset_id}/versions", response_model=list[DatasetVersionResponse])
def list_versions(
    project_id: UUID,
    dataset_id: UUID,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_client),
):
    _require_project(project_id, user_id, supabase)
    try:
        dataset = (
            supabase.table("datasets")
            .select("id")
            .eq("id", str(dataset_id))
            .eq("project_id", str(project_id))
            .maybe_single()
            .execute()
        )
        if not dataset.data:
            raise HTTPException(status_code=404, detail="Dataset not found")
        response = (
            supabase.table("dataset_versions")
            .select("*")
            .eq("dataset_id", str(dataset_id))
            .order("version_no", desc=True)
            .execute()
        )
    except HTTPException:
        raise
    except Exception as exc:
        _database_error(exc)
    return [DatasetVersionResponse.model_validate(r) for r in (response.data or [])]


@router.post("/{dataset_id}/versions", response_model=DatasetVersionResponse, status_code=201)
def create_dataset_version(
    project_id: UUID,
    dataset_id: UUID,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_client),
):
    _require_project(project_id, user_id, supabase)
    try:
        dataset = (
            supabase.table("datasets")
            .select("id")
            .eq("id", str(dataset_id))
            .eq("project_id", str(project_id))
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        _database_error(exc)
    if not dataset.data:
        raise HTTPException(status_code=404, detail="Dataset not found")

    return _ingest_version(dataset_id, project_id, user_id, file, supabase)
