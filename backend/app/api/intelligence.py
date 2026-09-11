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
class RunRequest(BaseModel):
 dataset_id:UUID
 prompt:str=Field(default="Analyze this dataset.",max_length=4000)
 stages:list[str]=Field(default_factory=lambda:["cleaning","analysis","insights","visualization"])
def _load(project_id,dataset_id,user_id,supabase):
 p=supabase.table("projects").select("id").eq("id",str(project_id)).eq("owner_id",user_id).maybe_single().execute()
 if not p.data: raise HTTPException(404,"Project not found")
 d=supabase.table("datasets").select("*").eq("id",str(dataset_id)).eq("project_id",str(project_id)).maybe_single().execute()
 if not d.data: raise HTTPException(404,"Dataset not found")
 v=supabase.table("dataset_versions").select("*").eq("dataset_id",str(dataset_id)).eq("version_no",d.data["current_version"]).maybe_single().execute()
 if not v.data: raise HTTPException(404,"Dataset version not found")
 raw=supabase.storage.from_("datasets").download(v.data["storage_path"])
 try:return pd.read_csv(BytesIO(raw)) if v.data["original_filename"].lower().endswith(".csv") else pd.read_excel(BytesIO(raw))
 except Exception as e: raise HTTPException(422,"The current dataset could not be read") from e
def _clean(df):
 out=df.copy();notes=[];before=len(out);out=out.drop_duplicates().reset_index(drop=True)
 if len(out)!=before: notes.append(f"Removed {before-len(out)} duplicate rows")
 for c in out.columns:
  if out[c].isna().any():
   n=int(out[c].isna().sum())
   if pd.api.types.is_numeric_dtype(out[c]): out[c]=out[c].fillna(out[c].median())
   else:
    mode=out[c].mode(dropna=True);out[c]=out[c].fillna(mode.iloc[0] if not mode.empty else "")
   notes.append(f"Filled {n} missing values in {c}")
 return out,notes
def _analysis(df):
 numeric=df.select_dtypes(include=np.number);summary=[]
 for c in numeric.columns:
  s=numeric[c].dropna()
  if len(s): summary.append({"column":c,"count":int(s.size),"mean":float(s.mean()),"min":float(s.min()),"max":float(s.max()),"std":float(s.std(ddof=0))})
 corr=numeric.corr().round(4).replace({np.nan:None}).to_dict() if len(numeric.columns)>1 else {}
 target="Total" if "Total" in numeric.columns else (numeric.columns[-1] if len(numeric.columns) else None)
 relationships=[];pairs=[];cols=list(numeric.columns)
 if target and target in corr:
  for c,v in corr[target].items():
   if c!=target and v is not None: relationships.append({"x":c,"y":target,"r":float(v),"strength":"very strong" if abs(v)>=.8 else "strong" if abs(v)>=.6 else "moderate" if abs(v)>=.4 else "weak"})
 relationships=sorted(relationships,key=lambda x:abs(x["r"]),reverse=True)
 for i,a in enumerate(cols):
  for b in cols[i+1:]:
   v=corr.get(a,{}).get(b)
   if v is not None:pairs.append({"x":a,"y":b,"r":float(v)})
 pairs=sorted(pairs,key=lambda x:abs(x["r"]),reverse=True)[:12]
 outliers=[]
 for c in cols:
  s=numeric[c].dropna();q1,q3=s.quantile(.25),s.quantile(.75);iqr=q3-q1
  if iqr==0: continue
  n=int(((numeric[c]<q1-1.5*iqr)|(numeric[c]>q3+1.5*iqr)).sum())
  if n:outliers.append({"column":c,"count":n,"rate":round(n/max(1,len(df))*100,2)})
 return {"rows":int(len(df)),"columns":int(len(df.columns)),"numeric_columns":cols,"summary":summary,"correlations":corr,"target":target,"relationships":relationships[:10],"pairs":pairs,"outliers":sorted(outliers,key=lambda x:x["count"],reverse=True)[:10]}
def _questions(a):
 s={x["column"]:x for x in a["summary"]};rel=a["relationships"];qs=[]
 if rel:
  top,low=rel[0],rel[-1];t=a["target"]
  qs += [{"question":f"What is driving {t} the most?","answer":f"{top['x']} has the strongest relationship with {t}: r={top['r']:.2f}. Association is not causation.","type":"driver"},{"question":f"What is the weakest relationship with {t}?","answer":f"{low['x']} is weakest among measured numeric fields: r={low['r']:.2f}.","type":"relationship"}]
 if s:
  c=max(s,key=lambda x:s[x]["std"]);qs.append({"question":"Which variable varies the most?","answer":f"{c} has the largest standard deviation ({s[c]['std']:.2f}).","type":"variation"})
 if a["outliers"]:
  o=a["outliers"][0];qs.append({"question":"Where are the biggest anomalies?","answer":f"{o['column']} has {o['count']} IQR-based outlier rows ({o['rate']:.1f}%).","type":"anomaly"})
 if a["pairs"]:
  p=a["pairs"][0];qs.append({"question":"Which variables may be telling the same story?","answer":f"{p['x']} and {p['y']} move together at r={p['r']:.2f}; check for overlapping signal.","type":"redundancy"})
 qs += [{"question":"What should I investigate next?","answer":"Test the strongest relationships with multivariable analysis and inspect the largest outliers before making decisions.","type":"decision"},{"question":"What can this data not prove?","answer":"Descriptive statistics and correlations show patterns and associations; they do not establish causation or guarantee future outcomes.","type":"caution"}]
 return qs
def _charts(df,a):
 charts=[];numeric=list(df.select_dtypes(include=np.number).columns)
 for c in numeric[:6]:
  d=df[[c]].dropna().reset_index().rename(columns={"index":"row",c:"value"}).tail(120)
  charts.append({"type":"line","title":f"{c} across observations","xKey":"row","yKey":"value","data":[{"row":int(r.row),"value":float(r.value)} for r in d.itertuples()]})
 for r in a["relationships"][:3]:
  d=df[[r["x"],r["y"]]].dropna().tail(160);charts.append({"type":"scatter","title":f"{r['x']} vs {r['y']}","xKey":r["x"],"yKey":r["y"],"data":[{r["x"]:float(x),r["y"]:float(y)} for x,y in d.itertuples(index=False,name=None)]})
 return charts
@router.post("/run")
def run(body:RunRequest,project_id:UUID,user_id:str=Depends(get_current_user_id),supabase:Client=Depends(get_supabase_client)):
 stages=[s for s in body.stages if s in {"cleaning","analysis","forecasting","insights","visualization","report"}];df=_load(project_id,body.dataset_id,user_id,supabase);result={"stages":stages,"dataset":{"rows":int(len(df)),"columns":int(len(df.columns))}};notes=[]
 if "cleaning" in stages:df,notes=_clean(df);result["cleaning"]={"changes":notes,"rows_after":int(len(df))}
 a=_analysis(df) if any(x in stages for x in ("analysis","insights","visualization","report")) else {}
 if "analysis" in stages:result["analysis"]=a
 if "insights" in stages:
  result["questions"]=_questions(a)
  try:
   text,provider,_=AIRouter().complete("analyze",[{"role":"system","content":"You are Gamur's senior data analyst. Use only supplied computed evidence. Be concise, evidence-led, decision-oriented, and cautious. Never invent facts."},{"role":"user","content":str({"request":body.prompt,"analysis":a,"questions":result["questions"],"cleaning":notes})}]);result["insights"]=text;result["insight_provider"]=provider
  except Exception:result["insights"]="Computed evidence is ready. The narrative AI layer is temporarily unavailable."
 if "visualization" in stages:result["visualization"]={"charts":_charts(df,a),"relationships":a.get("relationships",[])}
 if "forecasting" in stages:result["forecasting"]={"status":"ready","numeric_series":list(df.select_dtypes(include=np.number).columns)[:8]}
 if "report" in stages:result["report"]={"title":"Gamur Data Intelligence Report","prompt":body.prompt,"analysis":a,"insights":result.get("insights"),"questions":result.get("questions",[])}
 return result
