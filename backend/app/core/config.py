from functools import lru_cache
from pydantic import AnyHttpUrl, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Economic Intelligence Backend"
    app_env: str = "development"
    cors_origins: str = "http://localhost:3000"

    supabase_url: AnyHttpUrl
    supabase_service_role_key: SecretStr

    # AI providers are optional. Gamur chooses internally and falls back safely.
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-5-mini"
    hf_token: SecretStr | None = None
    hf_model: str = "meta-llama/Llama-3.3-70B-Instruct"
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-2.5-flash"
    mistral_api_key: SecretStr | None = None
    mistral_model: str = "mistral-small-latest"
    cohere_api_key: SecretStr | None = None
    cohere_model: str = "command-a-03-2025"
    xai_api_key: SecretStr | None = None
    xai_model: str = "grok-4.6"

    ollama_api_key: SecretStr | None = None
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "llama3.2"

    ai_default_order: str = "gemini,xai,mistral,cohere,huggingface,openai"
    ai_analyze_order: str = "gemini,xai,mistral,cohere,huggingface,openai"
    ai_visualize_order: str = "gemini,xai,mistral,cohere,huggingface,openai"
    ai_forecast_order: str = "mistral,xai,gemini,cohere,huggingface,openai"
    ai_report_order: str = "gemini,xai,cohere,mistral,huggingface,openai"
    ai_question_order: str = "gemini,xai,mistral,cohere,huggingface,openai"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @field_validator("app_env")
    @classmethod
    def validate_app_env(cls, value: str) -> str:
        allowed = {"development", "test", "staging", "production"}
        if value not in allowed:
            raise ValueError(f"APP_ENV must be one of: {', '.join(sorted(allowed))}")
        return value

    @model_validator(mode="after")
    def reject_placeholder_secrets(self) -> "Settings":
        if self.app_env in {"staging", "production"}:
            placeholders = {
                "https://YOUR_PROJECT.supabase.co",
                "YOUR_SERVICE_ROLE_KEY",
                "YOUR_OPENAI_API_KEY",
                "YOUR_MODEL_NAME",
                "YOUR_HF_TOKEN",
            }
            values = {
                str(self.supabase_url),
                self.supabase_service_role_key.get_secret_value(),
                self.openai_api_key.get_secret_value() if self.openai_api_key else "",
                self.openai_model,
                self.hf_token.get_secret_value() if self.hf_token else "",
            }
            if placeholders.intersection(values):
                raise ValueError("Placeholder secrets/configuration are not allowed outside development/test")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
