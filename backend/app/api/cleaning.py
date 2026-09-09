from __future__ import annotations
from pathlib import PurePosixPath
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from supabase import Client
from app.api.deps import get_current_user_id, get_supabase_client
from app.services.cleaning import CleaningPlan, apply_cleaning_plan, build_cleaning_plan
router=APIRouter(prefix="/projects/{project_id}/datasets",tags=["cleaning"])
class CleaningProposalResponse(BaseModel): id: UUID; status: str; plan: dict
class CleaningConfirmRequest(BaseModel): action_ids: list[str]=Field(default_factory=list)
class CleaningResultResponse(BaseModel): id: UUID; status: str; result: dict
def _require_version(project_id:UUID,dataset_id:UUID,version_no:int,user_id:str,supabase:Client)->dict:
    dataset=supabase.table("datasets").select("id").eq("id",str(dataset_id)).eq("project_id",str(project_id)).maybe_single().execute()
    if not dataset.data: raise HTTPException(status_code=404,detail="Dataset not found")
    project=supabase.table("projects").select("id").eq("id",str(project_id)).eq("owner_id",user_id).maybe_single().execute()
    if not project.data: raise HTTPException(status_code=404,detail="Project not found")
    version=supabase.table("dataset_versions").select("*").eq("dataset_id",str(dataset_id)).eq("version_no",version_no).maybe_single().execute()
    if not version.data: raise HTTPException(status_code=404,detail="Dataset version not found")
    return version.data
def _download(version:dict,supabase:Client)->tuple[bytes,str]:
    try: data=supabase.storage.from_("datasets").download(version["storage_path"])
    except Exception as exc: raise HTTPException(status_code=500,detail="Unable to read dataset source") from exc
    return data,PurePosixPath(version["original_filename"]).suffix.lower()
@router.post("/{dataset_id}/versions/{version_no}/cleaning/proposal",response_model=CleaningProposalResponse,status_code=201)
def create_cleaning_proposal(project_id:UUID,dataset_id:UUID,version_no:int,user_id:str=Depends(get_current_user_id),supabase:Client=Depends(get_supabase_client)):
    version=_require_version(project_id,dataset_id,version_no,user_id,supabase); data,suffix=_download(version,supabase); plan=build_cleaning_plan(data,suffix); run_id=uuid4()
    row={"id":str(run_id),"project_id":str(project_id),"dataset_id":str(dataset_id),"dataset_version_id":version["id"],"status":"proposed","source_hash":plan.source_hash,"plan":plan.to_dict(),"created_by":user_id}
    try: response=supabase.table("cleaning_runs").insert(row).select("id,status,plan").single().execute()
    except Exception as exc: raise HTTPException(status_code=500,detail="Unable to save cleaning proposal") from exc
    return CleaningProposalResponse.model_validate(response.data)
@router.post("/{dataset_id}/versions/{version_no}/cleaning/{run_id}/confirm",response_model=CleaningResultResponse)
def confirm_cleaning(project_id:UUID,dataset_id:UUID,version_no:int,run_id:UUID,payload:CleaningConfirmRequest,user_id:str=Depends(get_current_user_id),supabase:Client=Depends(get_supabase_client)):
    version=_require_version(project_id,dataset_id,version_no,user_id,supabase); run=supabase.table("cleaning_runs").select("*").eq("id",str(run_id)).eq("dataset_id",str(dataset_id)).eq("project_id",str(project_id)).maybe_single().execute()
    if not run.data: raise HTTPException(status_code=404,detail="Cleaning proposal not found")
    if run.data["status"]!="proposed": raise HTTPException(status_code=409,detail="Cleaning proposal has already been finalized")
    data,suffix=_download(version,supabase); plan_data=run.data["plan"]; actions=plan_data.get("actions",[]); known={a["action_id"] for a in actions}; unknown=set(payload.action_ids)-known
    if unknown: raise HTTPException(status_code=422,detail={"message":"Unknown cleaning action","action_ids":sorted(unknown)})
    from app.services.cleaning import CleaningAction
    plan=CleaningPlan(run.data["source_hash"],[CleaningAction(**a) for a in actions],bool(plan_data.get("requires_confirmation")))
    try: cleaned,result=apply_cleaning_plan(data,suffix,plan,set(payload.action_ids))
    except ValueError as exc: raise HTTPException(status_code=409,detail=str(exc)) from exc
    output_name=f"cleaned-{version_no}-{run_id}{suffix}"; storage_path=f"{user_id}/{project_id}/{dataset_id}/cleaning/{run_id}/{output_name}"
    try:
        supabase.storage.from_("datasets").upload(storage_path,cleaned,{"content-type":version.get("mime_type") or "application/octet-stream","upsert":"false"}); result["storage_path"]=storage_path
        updated=supabase.table("cleaning_runs").update({"status":"applied","result":result}).eq("id",str(run_id)).select("id,status,result").single().execute()
    except Exception as exc: raise HTTPException(status_code=500,detail="Unable to save cleaned dataset") from exc
    return CleaningResultResponse.model_validate(updated.data)
