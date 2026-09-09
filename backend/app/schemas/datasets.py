from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
class DatasetResponse(BaseModel):
    model_config=ConfigDict(extra="ignore")
    id:UUID; project_id:UUID; name:str; source_type:str; description:str|None=None; current_version:int; created_at:datetime; updated_at:datetime
class DatasetVersionResponse(BaseModel):
    model_config=ConfigDict(extra="ignore")
    id:UUID; dataset_id:UUID; version_no:int; original_filename:str; storage_path:str; mime_type:str|None=None; size_bytes:int|None=Field(default=None,ge=0); sheet_name:str|None=None; detected_header_row:int|None=Field(default=None,ge=0); row_count:int|None=Field(default=None,ge=0); column_count:int|None=Field(default=None,ge=0); quality_score:float|None=Field(default=None,ge=0,le=100); profile:dict=Field(default_factory=dict); created_at:datetime
