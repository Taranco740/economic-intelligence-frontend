from __future__ import annotations
from dataclasses import asdict, dataclass
from io import BytesIO
import hashlib
from typing import Any
import pandas as pd
RISKY_ACTIONS={"fill_missing","coerce_numeric","parse_dates","remove_outliers"}
@dataclass(frozen=True)
class CleaningAction:
    action_id:str; action_type:str; column:str|None; status:str; reason:str; affected_rows:int; affected_cells:int
    def to_dict(self)->dict[str,Any]: return asdict(self)
@dataclass(frozen=True)
class CleaningPlan:
    source_hash:str; actions:list[CleaningAction]; requires_confirmation:bool
    def to_dict(self)->dict[str,Any]: return {"source_hash":self.source_hash,"requires_confirmation":self.requires_confirmation,"actions":[a.to_dict() for a in self.actions]}
def _hash(data:bytes)->str:return hashlib.sha256(data).hexdigest()
def _read(data:bytes,suffix:str)->pd.DataFrame:
    stream=BytesIO(data)
    if suffix.lower()==".csv":return pd.read_csv(stream)
    if suffix.lower()==".xlsx":return pd.read_excel(stream)
    raise ValueError("Only CSV and XLSX files are supported")
def _action(action_type,column,status,reason,rows,cells,index):return CleaningAction(f"{action_type}:{column or 'dataset'}:{index}",action_type,column,status,reason,rows,cells)
def build_cleaning_plan(data:bytes,suffix:str)->CleaningPlan:
    df=_read(data,suffix); actions=[]; index=0
    for column in df.columns:
        series=df[column]; text=series.astype("string"); blank_mask=text.str.strip().eq("") & series.notna()
        if int(blank_mask.sum()):index+=1;actions.append(_action("normalize_blank_strings",str(column),"safe","Convert whitespace-only cells to missing values.",0,int(blank_mask.sum()),index))
        if series.dtype==object or pd.api.types.is_string_dtype(series.dtype):
            changed=int((text.fillna("")!=text.fillna("").str.strip()).sum())
            if changed:index+=1;actions.append(_action("trim_text",str(column),"safe","Trim leading and trailing whitespace from text values.",changed,changed,index))
        missing=int(series.isna().sum())
        if missing:index+=1;actions.append(_action("fill_missing",str(column),"confirmation_required","Missing-value imputation changes user data and requires an explicit strategy.",missing,missing,index))
    duplicate_rows=int(df.duplicated().sum())
    if duplicate_rows:index+=1;actions.append(_action("drop_exact_duplicates",None,"safe","Remove exact duplicate rows only.",duplicate_rows,duplicate_rows*max(len(df.columns),1),index))
    for column in df.columns:
        series=df[column]
        if series.dtype==object and len(series.dropna()):
            numeric=pd.to_numeric(series,errors="coerce"); non_null=int(series.notna().sum()); convertible=int(numeric.notna().sum())
            if convertible and convertible<non_null:index+=1;actions.append(_action("coerce_numeric",str(column),"confirmation_required","Mixed numeric/text values detected; coercion may change or discard values.",non_null-convertible,non_null-convertible,index))
    return CleaningPlan(_hash(data),actions,any(a.status=="confirmation_required" for a in actions))
def apply_cleaning_plan(data:bytes,suffix:str,plan:CleaningPlan,confirmed_action_ids:set[str])->tuple[bytes,dict[str,Any]]:
    if _hash(data)!=plan.source_hash:raise ValueError("Source dataset changed since the cleaning plan was created")
    df=_read(data,suffix);before={"row_count":len(df),"column_count":len(df.columns),"source_hash":plan.source_hash};applied=[]
    for action in plan.actions:
        if action.status=="confirmation_required" and action.action_id not in confirmed_action_ids:continue
        if action.action_type=="normalize_blank_strings":
            mask=df[action.column].astype("string").str.strip().eq("") & df[action.column].notna();df.loc[mask,action.column]=pd.NA
        elif action.action_type=="trim_text":df[action.column]=df[action.column].astype("string").str.strip()
        elif action.action_type=="drop_exact_duplicates":df=df.drop_duplicates(ignore_index=True)
        elif action.action_type in RISKY_ACTIONS:continue
        applied.append(action.to_dict())
    output=BytesIO(); df.to_csv(output,index=False) if suffix.lower()==".csv" else df.to_excel(output,index=False);cleaned=output.getvalue();after={"row_count":len(df),"column_count":len(df.columns),"output_hash":_hash(cleaned)}
    return cleaned,{"before":before,"after":after,"applied_actions":applied}
