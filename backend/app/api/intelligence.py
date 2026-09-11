from __future__ import annotations
from io import BytesIO
from uuid import UUID
import numpy as np,pandas as pd
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field
from supabase import Client
from app.api.deps import get_current_user_id,get_supabase_client
from app.services.ai_router import AIRouter
router=APIRouter(prefix="/projects/{project_id}/intelligence",tags=["intelligence"])
class RunRequest(BaseModel):dataset_id:UUID;prompt:str=Field(default="Analyze this dataset.",max_length=4000);stages:list[str]=Field(default_factory=lambda:["cleaning","analysis","insights","visualization"])
def _load(project_id,dataset_id,user_id,supabase):
 p=supabase.table("projects").select("id").eq("id",str(project_id)).eq("owner_id",user_id).maybe_single().execute()
 if not p.data:raise HTTPException(404,"Project not found")
 d=supabase.table("datasets").select("*").eq("id",str(dataset_id)).eq("project_id",str(project_id)).maybe_single().execute()
 if not d.data:raise HTTPException(404,"Dataset not found")
 v=supabase.table("dataset_versions").select("*").eq("dataset_id",str(dataset_id)).eq("version_no",d.data["current_version"]).maybe_single().execute()
 if not v.data:raise HTTPException(404,"Dataset version not found")
 raw=supabase.storage.from_("datasets").download(v.data["storage_path"])
 try:return pd.read_csv(BytesIO(raw)) if v.data["original_filename"].lower().endswith(".csv") else pd.read_excel(BytesIO(raw))
 except Exception as e:raise HTTPException(422,"The current dataset could not be read") from e
def _clean(df):
 out=df.copy();notes=[];before=len(out);out=out.drop_duplicates().reset_index(drop=True)
 if len(out)!=before:notes.append(f"Removed {before-len(out)} duplicate rows")
 for c in out.columns:
  if out[c].isna().any():
   n=int(out[c].isna().sum())
   if pd.api.types.is_numeric_dtype(out[c]):out[c]=out[c].fillna(out[c].median())
   else:
    mode=out[c].mode(dropna=True);out[c]=out[c].fillna(mode.iloc[0] if not mode.empty else "")
   notes.append(f"Filled {n} missing values in {c}")
 return out,notes
def _analysis(df):
 numeric=df.select_dtypes(include=np.number);summary=[]
 for c in numeric.columns:
  s=numeric[c].dropna()
  if len(s):summary.append({"column":c,"count":int(s.size),"mean":float(s.mean()),"min":float(s.min()),"max":float(s.max()),"std":float(s.std(ddof=0))})
 corr=numeric.corr().round(4).replace({np.nan:None}).to_dict() if len(numeric.columns)>1 else {}
 return {"rows":int(len(df)),"columns":int(len(df.columns)),"numeric_columns":list(numeric.columns),"summary":summary,"correlations":corr}
def _charts(df):
 charts=[]
 for c in list(df.select_dtypes(include=np.number).columns)[:6]:
  d=df[[c]].dropna().reset_index().rename(columns={"index":"row",c:"value"}).tail(100)
  charts.append({"type":"line","title":f"{c} over rows","xKey":"row","yKey":"value","data":[{"row":int(r.row),"value":float(r.value)} for r in d.itertuples()]})
 return charts
@router.post("/run")
def run(body:RunRequest,project_id:UUID,user_id:str=Depends(get_current_user_id),supabase:Client=Depends(get_supabase_client)):
 stages=[s for s in body.stages if s in {"cleaning","analysis","forecasting","insights","visualization","report"}];df=_load(project_id,body.dataset_id,user_id,supabase);result={"stages":stages,"dataset":{"rows":int(len(df)),"columns":int(len(df.columns))}};notes=[]
 if "cleaning" in stages:df,notes=_clean(df);result["cleaning"]={"changes":notes,"rows_after":int(len(df))}
 analysis=_analysis(df) if "analysis" in stages or "insights" in stages else {}
 if "analysis" in stages:result["analysis"]=analysis
 if "forecasting" in stages:result["forecasting"]={"status":"ready","numeric_series":list(df.select_dtypes(include=np.number).columns)[:8]}
 if "insights" in stages:
  try:result["insights"],provider,failures=AIRouter().complete("analyze",[{"role":"system","content":"You are Gamuur's data analyst. Explain only computed results; never invent facts."},{"role":"user","content":str({"request":body.prompt,"analysis":analysis,"cleaning":notes})}]);result["ai_provider"]=provider;result["ai_fallback_used"]=bool(failures);result["ai_provider_failures"]=failures
  except Exception:result["insights"]="Computed analytics are ready, but no AI provider is currently available."
 if "visualization" in stages:result["visualization"]={"charts":_charts(df)}
 if "report" in stages:result["report"]={"title":"Gamuur Data Intelligence Report","prompt":body.prompt,"analysis":analysis,"insights":result.get("insights")}
 return result
