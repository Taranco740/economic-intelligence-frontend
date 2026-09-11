from __future__ import annotations
from io import BytesIO
from uuid import UUID
import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from supabase import Client
from app.api.deps import get_current_user_id, get_supabase_client
from app.services.ai_router import AIRouter

router = APIRouter(prefix="/projects/{project_id}/intelligence", tags=["intelligence"])
class RunRequest(BaseModel):
    dataset_id: UUID
    prompt: str = Field(default="Analyze this dataset.", max_length=4000)
    stages: list[str] = Field(default_factory=lambda:["cleaning","analysis","insights","visualization"])
class ForecastRequest(BaseModel):
    dataset_id: UUID
    target: str | None = None
    date_column: str | None = None
    horizon_years: int = Field(default=1, ge=1, le=10)

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

def _strength(r):
    a=abs(float(r));return "very strong" if a>=.8 else "strong" if a>=.6 else "moderate" if a>=.4 else "weak"

def _analysis(df):
    numeric=df.select_dtypes(include=np.number);summary=[]
    for c in numeric.columns:
        s=numeric[c].dropna()
        if not len(s): continue
        q1,median,q3=[float(s.quantile(q)) for q in (.25,.5,.75)]
        summary.append({"column":c,"count":int(s.size),"missing":int(df[c].isna().sum()),"unique":int(df[c].nunique()),"mean":float(s.mean()),"median":median,"std":float(s.std(ddof=1)) if len(s)>1 else 0.0,"variance":float(s.var(ddof=1)) if len(s)>1 else 0.0,"min":float(s.min()),"q1":q1,"q3":q3,"max":float(s.max()),"range":float(s.max()-s.min()),"iqr":float(q3-q1),"p05":float(s.quantile(.05)),"p10":float(s.quantile(.10)),"p90":float(s.quantile(.90)),"p95":float(s.quantile(.95))})
    categorical=[]
    for c in df.select_dtypes(exclude=np.number).columns:
        s=df[c].dropna().astype(str);counts=s.value_counts().head(12)
        categorical.append({"column":c,"count":int(len(s)),"missing":int(df[c].isna().sum()),"unique":int(s.nunique()),"mode":str(counts.index[0]) if len(counts) else None,"top_values":[{"value":str(k),"count":int(v),"share":round(float(v)/max(1,len(s)),4)} for k,v in counts.items()]})
    corr_df=numeric.corr();corr=corr_df.round(4).replace({np.nan:None}).to_dict() if len(numeric.columns)>1 else {}
    target="Total" if "Total" in numeric.columns else (numeric.columns[-1] if len(numeric.columns) else None);relationships=[];pairs=[];cols=list(numeric.columns)
    if target and target in corr:
        for c,v in corr[target].items():
            if c!=target and v is not None: relationships.append({"x":c,"y":target,"r":float(v),"strength":_strength(v)})
    relationships=sorted(relationships,key=lambda x:abs(x["r"]),reverse=True)
    for i,a in enumerate(cols):
        for b in cols[i+1:]:
            v=corr.get(a,{}).get(b)
            if v is not None:pairs.append({"x":a,"y":b,"r":float(v),"strength":_strength(v)})
    pairs=sorted(pairs,key=lambda x:abs(x["r"]),reverse=True)[:20];outliers=[]
    for c in cols:
        s=numeric[c].dropna();q1,q3=s.quantile(.25),s.quantile(.75);iqr=q3-q1
        if iqr==0: continue
        n=int(((numeric[c]<q1-1.5*iqr)|(numeric[c]>q3+1.5*iqr)).sum())
        if n:outliers.append({"column":c,"count":n,"rate":round(n/max(1,len(df)),4),"lower":float(q1-1.5*iqr),"upper":float(q3+1.5*iqr)})
    date_columns=[]
    for c in df.columns:
        parsed=pd.to_datetime(df[c],errors="coerce")
        if len(df) and float(parsed.notna().mean())>=.8: date_columns.append({"column":c,"coverage":round(float(parsed.notna().mean()),3),"min":str(parsed.min()),"max":str(parsed.max()),"frequency_hint":"time"})
    return {"rows":int(len(df)),"columns":int(len(df.columns)),"numeric_columns":cols,"categorical_columns":list(df.select_dtypes(exclude=np.number).columns),"summary":summary,"categorical_summary":categorical,"correlations":corr,"target":target,"relationships":relationships[:12],"pairs":pairs,"outliers":sorted(outliers,key=lambda x:x["count"],reverse=True)[:15],"date_columns":date_columns}

def _questions(a):
    s={x["column"]:x for x in a.get("summary",[])};rel=a.get("relationships",[]);qs=[]
    if rel:
        top,low=rel[0],rel[-1];t=a.get("target");qs += [{"question":f"What is driving {t} the most?","answer":f"{top['x']} has the strongest measured relationship with {t}: r={top['r']:.2f}. Association is not causation.","type":"driver"},{"question":f"What is the weakest relationship with {t}?","answer":f"{low['x']} is weakest among measured numeric fields: r={low['r']:.2f}.","type":"relationship"}]
    if s:
        c=max(s,key=lambda x:s[x]["std"]);qs.append({"question":"Which variable varies the most?","answer":f"{c} has the largest standard deviation ({s[c]['std']:.2f}) and range ({s[c]['range']:.2f}).","type":"variation"})
    if a.get("outliers"):
        o=a["outliers"][0];qs.append({"question":"Where are the biggest anomalies?","answer":f"{o['column']} has {o['count']} IQR-based outlier rows ({o['rate']*100:.1f}%).","type":"anomaly"})
    if a.get("pairs"):
        p=a["pairs"][0];qs.append({"question":"Which variables may be telling the same story?","answer":f"{p['x']} and {p['y']} move together at r={p['r']:.2f}; check for overlapping signal.","type":"redundancy"})
    if a.get("date_columns"): qs.append({"question":"Is there a time dimension suitable for forecasting?","answer":f"Yes. {a['date_columns'][0]['column']} appears to contain ordered dates. Forecastability still requires enough observations and a suitable target series.","type":"forecastability"})
    else: qs.append({"question":"Is this dataset naturally forecastable?","answer":"No clear date/time field was detected, so Gamur should not manufacture a time-series forecast.","type":"forecastability"})
    qs += [{"question":"What should I investigate next?","answer":"Test the strongest relationships with multivariable analysis, inspect the largest outliers, and examine time structure when available.","type":"decision"},{"question":"What can this data not prove?","answer":"Descriptive statistics and correlations show patterns and associations; they do not establish causation or guarantee future outcomes.","type":"caution"}]
    return qs

def _visuals(df,a):
    visuals=[];numeric=a.get("numeric_columns",[])
    for c in numeric[:8]:
        vals=pd.to_numeric(df[c],errors="coerce").dropna().reset_index(drop=True)
        if not len(vals): continue
        step=max(1,len(vals)//160);visuals.append({"type":"line","category":"trend","title":f"{c} across observations","xKey":"x","yKey":"y","data":[{"x":int(i),"y":float(v)} for i,v in vals.iloc[::step].items()]})
    for s in a.get("summary",[])[:8]:
        vals=pd.to_numeric(df[s["column"]],errors="coerce").dropna();
        if not len(vals): continue
        hist,edges=np.histogram(vals,bins=min(12,max(5,int(np.sqrt(len(vals))))));visuals.append({"type":"histogram","category":"distribution","title":f"Distribution of {s['column']}","xKey":"bin","yKey":"count","data":[{"bin":f"{edges[i]:.1f}–{edges[i+1]:.1f}","count":int(hist[i])} for i in range(len(hist))]})
        visuals.append({"type":"box","category":"distribution","title":f"Spread and outliers — {s['column']}","column":s["column"],"min":s["min"],"q1":s["q1"],"median":s["median"],"q3":s["q3"],"max":s["max"],"outlierCount":next((o["count"] for o in a.get("outliers",[]) if o["column"]==s["column"]),0)})
    for r in a.get("relationships",[])[:8]:
        d=df[[r["x"],r["y"]]].apply(pd.to_numeric,errors="coerce").dropna().tail(220);visuals.append({"type":"scatter","category":"relationship","title":f"{r['x']} vs {r['y']}","xKey":r["x"],"yKey":r["y"],"r":r["r"],"data":[{r["x"]:float(x),r["y"]:float(y)} for x,y in d.itertuples(index=False,name=None)]})
    for c in a.get("categorical_columns",[])[:5]:
        top=next((x for x in a.get("categorical_summary",[]) if x["column"]==c),None)
        if top and top["top_values"]: visuals.append({"type":"bar","category":"comparison","title":f"Top categories — {c}","xKey":"value","yKey":"count","data":[{"value":x["value"],"count":x["count"]} for x in top["top_values"]]})
    if a.get("correlations"):
        visuals.append({"type":"heatmap","category":"relationship","title":"Correlation heatmap","columns":numeric[:14],"matrix":[[a["correlations"].get(x,{}).get(y) for y in numeric[:14]] for x in numeric[:14]]})
    return visuals

def _forecast_meta(df,a):
    dates=a.get("date_columns",[]);target=a.get("target")
    if not dates or not target or len(df)<12:return {"status":"not_forecastable","reason":"A usable date field, numeric target, and sufficient observations are required.","horizon_min_years":1,"horizon_max_years":10,"date_column":dates[0]["column"] if dates else None,"target":target}
    date_col=dates[0]["column"];parsed=pd.to_datetime(df[date_col],errors="coerce");valid=pd.DataFrame({"date":parsed,"value":pd.to_numeric(df[target],errors="coerce")}).dropna().sort_values("date")
    if len(valid)<12 or valid["date"].nunique()<8:return {"status":"not_forecastable","reason":"The detected time field does not contain enough distinct observations for a reliable forecast.","horizon_min_years":1,"horizon_max_years":10,"date_column":date_col,"target":target}
    years=max(1,(valid.date.max()-valid.date.min()).days)/365.25;freq="monthly" if len(valid)>=18 and years>=1.2 else "quarterly" if len(valid)>=8 else "irregular"
    return {"status":"forecastable","reason":"A usable time field and numeric target were detected.","horizon_min_years":1,"horizon_max_years":10,"date_column":date_col,"target":target,"observations":int(len(valid)),"history_start":str(valid.date.min().date()),"history_end":str(valid.date.max().date()),"history_years":round(years,2),"frequency":freq}

def _linear_forecast(valid,horizon_years,freq):
    periods=max(1,horizon_years*(12 if freq=="monthly" else 4));y=valid["value"].to_numpy(float);x=np.arange(len(y),dtype=float)
    if len(y)<6:return None
    split=max(4,int(len(y)*.8));coef=np.polyfit(x[:split],y[:split],1);pred_train=np.polyval(coef,x[:split]);rmse=float(np.sqrt(np.mean((y[:split]-pred_train)**2)))
    coef2=np.polyfit(x,y,1);future_x=np.arange(len(y),len(y)+periods,dtype=float);future=np.polyval(coef2,future_x);res=y-np.polyval(coef2,x);sigma=float(np.std(res,ddof=1)) if len(res)>2 else rmse
    step=pd.DateOffset(months=1 if freq=="monthly" else 3);last=valid["date"].iloc[-1];dates=[last+step*i for i in range(1,periods+1)];z=1.96;interval=z*sigma
    return {"method":"linear_trend","backtest_rmse":round(rmse,4),"residual_std":round(sigma,4),"forecast":[{"date":d.date().isoformat(),"forecast":round(float(v),4),"lower":round(float(v-interval),4),"upper":round(float(v+interval),4)} for d,v in zip(dates,future)],"historical":[{"date":d.date().isoformat(),"actual":round(float(v),4)} for d,v in zip(valid["date"].tail(240),valid["value"].tail(240))]}

@router.post("/run")
def run(body:RunRequest,project_id:UUID,user_id:str=Depends(get_current_user_id),supabase:Client=Depends(get_supabase_client)):
    allowed={"cleaning","analysis","forecasting","insights","visualization","report"};stages=[s for s in body.stages if s in allowed];df=_load(project_id,body.dataset_id,user_id,supabase);result={"stages":stages,"dataset":{"rows":int(len(df)),"columns":int(len(df.columns))}};notes=[]
    if "cleaning" in stages:df,notes=_clean(df);result["cleaning"]={"changes":notes,"rows_after":int(len(df))}
    a=_analysis(df) if any(x in stages for x in ("analysis","insights","visualization","forecasting","report")) else {}
    if "analysis" in stages:result["analysis"]=a
    if "insights" in stages:
        result["questions"]=_questions(a)
        try:
            text,provider,_=AIRouter().complete("analyze",[{"role":"system","content":"You are Gamur's senior data analyst. Use only supplied computed evidence. Be concise, evidence-led, decision-oriented, domain-aware and cautious. Never invent facts."},{"role":"user","content":str({"request":body.prompt,"analysis":a,"questions":result["questions"],"cleaning":notes})}]);result["insights"]=text;result["insight_provider"]=provider
        except Exception:result["insights"]="Computed evidence is ready. The narrative AI layer is temporarily unavailable."
    if "visualization" in stages:
        vs=_visuals(df,a);result["visualization"]={"visuals":vs,"charts":[v for v in vs if v.get("type") in {"line","scatter"}],"relationships":a.get("relationships",[]),"recommended":"Selected from field types, distributions, relationships and detected time structure."}
    if "forecasting" in stages:result["forecasting"]=_forecast_meta(df,a)
    if "report" in stages:result["report"]={"title":"Gamur Data Intelligence Report","prompt":body.prompt,"analysis":a,"insights":result.get("insights"),"questions":result.get("questions",[])}
    return result

@router.post("/forecast")
def forecast(body:ForecastRequest,project_id:UUID,user_id:str=Depends(get_current_user_id),supabase:Client=Depends(get_supabase_client)):
    df,_=_clean(_load(project_id,body.dataset_id,user_id,supabase));a=_analysis(df);meta=_forecast_meta(df,a)
    if meta.get("status")!="forecastable":raise HTTPException(422,meta.get("reason","Dataset is not forecastable"))
    date_col=body.date_column or meta["date_column"];target=body.target or meta["target"]
    if date_col not in df.columns or target not in df.columns:raise HTTPException(422,"Selected forecast field is not present in the dataset")
    valid=pd.DataFrame({"date":pd.to_datetime(df[date_col],errors="coerce"),"value":pd.to_numeric(df[target],errors="coerce")}).dropna().sort_values("date")
    out=_linear_forecast(valid,body.horizon_years,meta["frequency"])
    if not out:raise HTTPException(422,"Not enough observations for a forecast model")
    return {"status":"complete","target":target,"date_column":date_col,"horizon_years":body.horizon_years,"frequency":meta["frequency"],"method":out["method"],"backtest_rmse":out["backtest_rmse"],"residual_std":out["residual_std"],"historical":out["historical"],"forecast":out["forecast"],"caution":"This baseline forecast is an estimate. Gamur should compare model performance and uncertainty before business decisions."}
