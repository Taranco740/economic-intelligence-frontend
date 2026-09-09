from functools import lru_cache
from pydantic import AnyHttpUrl, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    app_name:str="Economic Intelligence Backend"; app_env:str="development"; cors_origins:str="http://localhost:3000"
    supabase_url:AnyHttpUrl; supabase_service_role_key:SecretStr; openai_api_key:SecretStr; openai_model:str
    model_config=SettingsConfigDict(env_file=".env",env_file_encoding="utf-8",extra="ignore",case_sensitive=False)
    @field_validator("app_env")
    @classmethod
    def validate_app_env(cls,value:str)->str:
        allowed={"development","test","staging","production"}
        if value not in allowed: raise ValueError(f"APP_ENV must be one of: {', '.join(sorted(allowed))}")
        return value
    @field_validator("openai_model")
    @classmethod
    def validate_model_name(cls,value:str)->str:
        value=value.strip()
        if not value or value.upper()=="YOUR_MODEL_NAME": raise ValueError("OPENAI_MODEL must be configured")
        return value
    @model_validator(mode="after")
    def reject_placeholder_secrets(self)->"Settings":
        if self.app_env in {"staging","production"}:
            placeholders={"https://YOUR_PROJECT.supabase.co","YOUR_SERVICE_ROLE_KEY","YOUR_OPENAI_API_KEY","YOUR_MODEL_NAME"}
            values={str(self.supabase_url),self.supabase_service_role_key.get_secret_value(),self.openai_api_key.get_secret_value(),self.openai_model}
            if placeholders.intersection(values): raise ValueError("Placeholder secrets/configuration are not allowed outside development/test")
        return self
@lru_cache
def get_settings()->Settings: return Settings()
