from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.chat import router as chat_router
from app.api.cleaning import router as cleaning_router
from app.api.datasets import router as datasets_router
from app.api.projects import router as projects_router
from app.api.intelligence import router as intelligence_router
from app.api.history import router as history_router
from app.core.config import get_settings
from app.core.supabase import get_supabase_client
settings=get_settings()
app=FastAPI(title=settings.app_name,version="0.7.0")
cors_origins=[o.strip() for o in getattr(settings,"cors_origins","http://localhost:3000").split(",") if o.strip()]
app.add_middleware(CORSMiddleware,allow_origins=cors_origins,allow_credentials=True,allow_methods=["*"],allow_headers=["*"])
@app.middleware("http")
async def strip_vercel_api_prefix(request,call_next):
    path=request.scope.get("path","")
    if path=="/api":request.scope["path"]="/"
    elif path.startswith("/api/"):request.scope["path"]=path[4:]
    return await call_next(request)
app.include_router(chat_router);app.include_router(projects_router);app.include_router(datasets_router);app.include_router(cleaning_router);app.include_router(intelligence_router);app.include_router(history_router)
@app.get("/health",tags=["system"])
def health():return {"status":"ok","service":settings.app_name}
@app.get("/health/ready",tags=["system"])
def readiness():get_supabase_client().table("profiles").select("id").limit(1).execute();return {"status":"ready","database":"ok"}
