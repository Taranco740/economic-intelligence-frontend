from __future__ import annotations
from dataclasses import dataclass
from io import BytesIO
from typing import Any
import pandas as pd
@dataclass(frozen=True)
class ProfileResult:
    profile:dict[str,Any]; valid:bool; errors:list[str]; warnings:list[str]
def _column_type(series:pd.Series)->str:
    if pd.api.types.is_bool_dtype(series):return "boolean"
    if pd.api.types.is_numeric_dtype(series):return "numeric"
    if pd.api.types.is_datetime64_any_dtype(series):return "datetime"
    non_null=series.dropna()
    if len(non_null) and pd.to_datetime(non_null,errors="coerce").notna().mean()>=0.95:return "datetime"
    return "text"
def profile_dataframe(df:pd.DataFrame)->ProfileResult:
    columns=[str(c).strip() for c in df.columns];errors=[];warnings=[]
    if not columns:errors.append("Dataset has no columns")
    if any(not c for c in columns):errors.append("Dataset contains blank column names")
    duplicate_columns=len(columns)-len(set(columns))
    if duplicate_columns:errors.append(f"Dataset contains {duplicate_columns} duplicate column name(s)")
    row_count,column_count=df.shape;missing_by_column=df.isna().sum();duplicate_rows=int(df.duplicated().sum()) if row_count else 0;field_metrics={}
    for original,clean in zip(df.columns,columns):
        series=df[original];missing=int(series.isna().sum());non_null=series.dropna();inferred=_column_type(series);metric={"type":inferred,"pandas_dtype":str(series.dtype),"missing_count":missing,"missing_percent":round(100*missing/max(row_count,1),2),"unique_count":int(series.nunique(dropna=True)),"unique_percent":round(100*series.nunique(dropna=True)/max(len(non_null),1),2)}
        if inferred=="numeric" and len(non_null):
            metric.update({"min":float(non_null.min()),"max":float(non_null.max()),"mean":float(non_null.mean()),"median":float(non_null.median())});q1,q3=non_null.quantile([.25,.75]);iqr=q3-q1;outliers=((non_null<q1-1.5*iqr)|(non_null>q3+1.5*iqr)).sum();metric["outlier_count"]=int(outliers);metric["outlier_percent"]=round(100*int(outliers)/max(len(non_null),1),2)
        field_metrics[clean]=metric
        if metric["missing_percent"]>50:warnings.append(f"Column '{clean}' has more than 50% missing values")
    missing_cells=int(missing_by_column.sum());total_cells=row_count*column_count;completeness=100.0 if total_cells==0 else 100*(1-missing_cells/total_cells);duplicate_percent=0.0 if row_count==0 else 100*duplicate_rows/row_count;score=max(0.0,min(100.0,completeness-min(20.0,duplicate_percent)))
    if duplicate_rows:warnings.append(f"Dataset contains {duplicate_rows} duplicate row(s)")
    if row_count==0:errors.append("Dataset contains no data rows")
    profile={"row_count":int(row_count),"column_count":int(column_count),"columns":columns,"field_metrics":field_metrics,"missing_cells":missing_cells,"duplicate_rows":duplicate_rows,"duplicate_columns":duplicate_columns,"duplicate_percent":round(duplicate_percent,2),"completeness_percent":round(completeness,2),"quality_score":round(score,2)}
    return ProfileResult(profile,not errors,errors,warnings)
def profile_bytes(data:bytes,suffix:str)->ProfileResult:
    if suffix==".csv":df=pd.read_csv(BytesIO(data));sheet_name=None
    elif suffix==".xlsx":
        workbook=pd.ExcelFile(BytesIO(data),engine="openpyxl")
        if not workbook.sheet_names:raise ValueError("Workbook has no worksheets")
        sheet_name=workbook.sheet_names[0];df=pd.read_excel(workbook,sheet_name=sheet_name)
    else:raise ValueError("Unsupported file type")
    result=profile_dataframe(df);result.profile["sheet_name"]=sheet_name;result.profile["sample_values"]=df.head(200).astype(object).where(df.head(200).notna(),None).to_dict(orient="records");result.profile["dtypes"]={str(k):str(v) for k,v in df.dtypes.items()};return result
