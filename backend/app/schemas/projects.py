from datetime import datetime
from typing import Any, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator
ProjectStatus=Literal["active","archived"]
class ProjectCreate(BaseModel):
    name:str=Field(min_length=1,max_length=200); description:str|None=Field(default=None,max_length=2000); settings:dict[str,Any]=Field(default_factory=dict)
    @field_validator("name")
    @classmethod
    def normalize_name(cls,value:str)->str:
        value=value.strip()
        if not value: raise ValueError("Project name cannot be blank")
        return value
class ProjectUpdate(BaseModel):
    name:str|None=Field(default=None,min_length=1,max_length=200); description:str|None=Field(default=None,max_length=2000); status:ProjectStatus|None=None; settings:dict[str,Any]|None=None
    @field_validator("name")
    @classmethod
    def normalize_name(cls,value:str|None)->str|None:
        if value is None:return None
        value=value.strip()
        if not value:raise ValueError("Project name cannot be blank")
        return value
class ProjectResponse(BaseModel):
    model_config=ConfigDict(from_attributes=True)
    id:UUID; owner_id:UUID; name:str; description:str|None; status:ProjectStatus; settings:dict[str,Any]; created_at:datetime; updated_at:datetime
