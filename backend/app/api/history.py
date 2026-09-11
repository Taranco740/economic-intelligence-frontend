from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from supabase import Client
from app.api.deps import get_current_user_id, get_supabase_client
router=APIRouter(prefix="/history",tags=["history"])
class HistoryItem(BaseModel):
 id:str;project_id:str;title:str;mode:str;created_at:str;dataset_id:str|None=None;result:dict={}
class ConversationCreate(BaseModel):
 title:str=Field(min_length=1,max_length=200);mode:str="full";dataset_id:UUID|None=None;result:dict={}
@router.get("",response_model=list[HistoryItem])
def list_history(user_id:str=Depends(get_current_user_id),supabase:Client=Depends(get_supabase_client)):
 projects=supabase.table("projects").select("id,name").eq("owner_id",user_id).execute().data or []
 if not projects:return []
 ids=[p["id"] for p in projects]
 rows=supabase.table("conversations").select("id,project_id,mode,created_at,title,dataset_id,result").in_("project_id",ids).order("created_at",desc=True).limit(100).execute().data or []
 names={p["id"]:p["name"] for p in projects}
 out=[]
 for r in rows:
  out.append(HistoryItem(id=str(r["id"]),project_id=str(r["project_id"]),title=r.get("title") or names.get(r["project_id"],"Analysis"),mode=r.get("mode","full"),created_at=r["created_at"],dataset_id=str(r["dataset_id"]) if r.get("dataset_id") else None,result=r.get("result") or {}))
 return out
@router.post("/projects/{project_id}",response_model=HistoryItem)
def create_history(project_id:UUID,body:ConversationCreate,user_id:str=Depends(get_current_user_id),supabase:Client=Depends(get_supabase_client)):
 project=supabase.table("projects").select("id").eq("id",str(project_id)).eq("owner_id",user_id).maybe_single().execute()
 if not project.data:raise HTTPException(404,"Project not found")
 payload={"project_id":str(project_id),"mode":body.mode,"title":body.title,"result":body.result}
 if body.dataset_id:payload["dataset_id"]=str(body.dataset_id)
 rows=supabase.table("conversations").insert(payload).select("id,project_id,mode,created_at,title,dataset_id,result").execute().data or []
 if not rows:raise HTTPException(500,"Could not create analysis history")
 r=rows[0]
 return HistoryItem(id=str(r["id"]),project_id=str(project_id),title=r.get("title") or body.title,mode=r.get("mode",body.mode),created_at=r["created_at"],dataset_id=str(r["dataset_id"]) if r.get("dataset_id") else None,result=r.get("result") or {})
@router.patch("/{history_id}",response_model=HistoryItem)
def rename_history(history_id:UUID,body:ConversationCreate,user_id:str=Depends(get_current_user_id),supabase:Client=Depends(get_supabase_client)):
 row=supabase.table("conversations").select("id,project_id,mode,created_at,title,dataset_id,result").eq("id",str(history_id)).maybe_single().execute().data
 if not row:raise HTTPException(404,"Analysis not found")
 owner=supabase.table("projects").select("id").eq("id",row["project_id"]).eq("owner_id",user_id).maybe_single().execute().data
 if not owner:raise HTTPException(404,"Analysis not found")
 rows=supabase.table("conversations").update({"title":body.title}).eq("id",str(history_id)).select("id,project_id,mode,created_at,title,dataset_id,result").execute().data or []
 if not rows:raise HTTPException(500,"Could not rename analysis")
 r=rows[0]
 return HistoryItem(id=str(r["id"]),project_id=str(r["project_id"]),title=r.get("title") or "Analysis",mode=r.get("mode","full"),created_at=r["created_at"],dataset_id=str(r["dataset_id"]) if r.get("dataset_id") else None,result=r.get("result") or {})
