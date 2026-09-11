from functools import lru_cache
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client
from app.core.config import Settings, get_settings

bearer_scheme = HTTPBearer(auto_error=False)

@lru_cache
def get_supabase_client() -> Client:
    s = get_settings()
    return create_client(str(s.supabase_url), s.supabase_service_role_key.get_secret_value())

def get_current_user_id(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme), supabase: Client = Depends(get_supabase_client)) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required", headers={"WWW-Authenticate": "Bearer"})
    try:
        user = supabase.auth.get_user(credentials.credentials).user
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"}) from exc
    if user is None or not user.id:
        raise HTTPException(status_code=401, detail="Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"})
    return user.id

def get_settings_dependency() -> Settings:
    return get_settings()
