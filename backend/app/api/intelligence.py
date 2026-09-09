from __future__ import annotations
from io import BytesIO
from uuid import UUID
import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field
from supabase import Client
from app.api.deps import get_current_user_id, get_supabase_client
from app.core.config import get_settings
router = APIRouter(prefix="/projects/{project_id}/intelligence", tags=["intelligence"])
class RunRequest(BaseModel):
    dataset_id: UUID
    prompt: str = Field(default="Analyze this dataset.", max_length=4000)
    stages: list[str] = Field(default_factory=lambda: ["cleaning", "analysis", "insights", "visualization"])
def _load_dataset(project_id: UUID, dataset_id: UUID, user_id: str, supabase: Client) -> pd.DataFrame:
    project = supabase.table("projects").select("id").eq("id", str(project_id)).eq("owner_id", user_id).maybe_single().execute()
    if not project.data: raise HTTPException(status_code=404, detail="Project not found")
    dataset = supabase.table("datasets").select("*").eq("id", str(dataset_id)).eq("project_id", str(project_id)).maybe_single().execute()
    if not dataset.data: raise HTTPException(status_code=404, detail="Dataset not found")
    version = supabase.table("dataset_versions").select("*").eq("dataset_id", str(dataset_id)).eq("version_no", dataset.data["current_version"]).maybe_single().execute()
    if not version.data: raise HTTPException(status_code=404, detail="Dataset version not found")
    raw = supabase.storage.from_("datasets").download(version.data["storage_path"])
    try:
        return pd.read_csv(BytesIO(raw)) if version.data["original_filename"].lower().endswith(".csv") else pd.read_excel(BytesIO(raw))
    except Exception as exc: raise HTTPException(status_code=422, detail="The current dataset could not be read") from exc
def _clean(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    out, notes = df.copy(), []
    before = len(out); out = out.drop_duplicates().reset_index(drop=True)
    if len(out) != before: notes.append(f"Removed {before-len(out)} duplicate rows")
    for col in out.columns:
        if out[col].isna().any():
            missing = int(out[col].isna().sum())
            if pd.api.types.is_numeric_dtype(out[col]): out[col] = out[col].fillna(out[col].median())
            else:
                mode = out[col].mode(dropna=True); out[col] = out[col].fillna(mode.iloc[0] if not mode.empty else "")
            notes.append(f"Filled {missing} missing values in {col}")
    return out, notes
def _analysis(df: pd.DataFrame) -> dict:
    numeric = df.select_dtypes(include=np.number); summary=[]
    for col in numeric.columns:
        s=numeric[col].dropna()
        if len(s): summary.append({"column":col,"count":int(s.size),"mean":float(s.mean()),"min":float(s.min()),"max":float(s.max()),"std":float(s.std(ddof=0))})
    corr=numeric.corr().round(4).replace({np.nan:None}).to_dict() if len(numeric.columns)>1 else {}
    return {"rows":int(len(df)),"columns":int(len(df.columns)),"numeric_columns":list(numeric.columns),"summary":summary,"correlations":corr}
def _visualization(df: pd.DataFrame) -> list[dict]:
    charts=[]; numeric=list(df.select_dtypes(include=np.number).columns)
    for col in numeric[:4]:
        data=df[[col]].dropna().reset_index().rename(columns={"index":"row",col:"value"}).tail(100)
        charts.append({"type":"line","title":f"{col} over rows","xKey":"row","yKey":"value","data":[{"row":int(r.row),"value":float(r.value)} for r in data.itertuples()]})
    return charts
def _ai_insights(prompt: str, analysis: dict, cleaning_notes: list[str]) -> str:
    settings=get_settings(); token=settings.hf_token.get_secret_value() if settings.hf_token else ""
    if not token: return "AI Insights is ready, but the Hugging Face server token has not been configured yet."
    client=OpenAI(api_key=token, base_url="https://router.huggingface.co/v1/")
    response=client.chat.completions.create(model=settings.hf_model,messages=[
        {"role":"system","content":"You are Gamuur's economic intelligence analyst. Explain computed dataset results clearly. Do not invent facts or calculations."},
        {"role":"user","content":str({"request":prompt,"analysis":analysis,"cleaning":cleaning_notes})}])
    return response.choices[0].message.content or "No AI insight was returned."
@router.post("/run")
def run_intelligence(body: RunRequest, project_id: UUID, user_id: str=Depends(get_current_user_id), supabase: Client=Depends(get_supabase_client)):
    allowed={"cleaning","analysis","forecasting","insights","visualization","report"}; stages=[s for s in body.stages if s in allowed]
    df=_load_dataset(project_id,body.dataset_id,user_id,supabase); result={"stages":stages,"dataset":{"rows":int(len(df)),"columns":int(len(df.columns))}}
    notes=[]
    if "cleaning" in stages: df,notes=_clean(df); result["cleaning"]={"changes":notes,"rows_after":int(len(df))}
    analysis=_analysis(df) if "analysis" in stages or "insights" in stages else {}
    if "analysis" in stages: result["analysis"]=analysis
    if "forecasting" in stages:
        numeric=list(df.select_dtypes(include=np.number).columns); result["forecasting"]={"status":"ready","numeric_series":numeric[:8]}
    if "insights" in stages: result["insights"]=_ai_insights(body.prompt,analysis,notes)
    if "visualization" in stages: result["visualization"]={"charts":_visualization(df)}
    if "report" in stages: result["report"]={"title":"Gamuur Data Intelligence Report","prompt":body.prompt,"analysis":analysis,"insights":result.get("insights")}
    return result
