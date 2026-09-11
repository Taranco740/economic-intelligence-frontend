from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.api.deps import get_current_user_id
from app.services.ai_router import AIRouter
router=APIRouter(prefix="/chat",tags=["chat"])
class ChatRequest(BaseModel):message:str=Field(min_length=1,max_length=4000);language:str=Field(default="en",pattern="^(en|so|ar)$")
class ChatResponse(BaseModel):answer:str;language:str;ai_provider:str|None=None;ai_fallback_used:bool=False;ai_provider_failures:list[str]=[]
SYSTEM_PROMPTS={"en":"You are Gamuur, an economic intelligence assistant. Help with economics, data analysis, statistics, forecasting, research, business and policy. Never invent calculations or facts.","so":"Waxaad tahay Gamuur, kaaliye sirdoon dhaqaale. Ka caawi falanqaynta xogta, tirakoobka, saadaasha, cilmi-baarista, ganacsiga iyo dhaqaalaha. Ha been-abuurin xisaab ama xaqiiqo.","ar":"أنت Gamuur، مساعد للذكاء الاقتصادي. ساعد في تحليل البيانات والإحصاء والتنبؤ والبحث والاقتصاد والأعمال. لا تختلق الحسابات أو الحقائق."}
@router.post("",response_model=ChatResponse)
def chat(body:ChatRequest,_user_id:str=Depends(get_current_user_id)):
 try:
  answer,provider,failures=AIRouter().complete("analyze",[{"role":"system","content":SYSTEM_PROMPTS[body.language]},{"role":"user","content":body.message}])
  return ChatResponse(answer=answer,language=body.language,ai_provider=provider,ai_fallback_used=bool(failures),ai_provider_failures=failures)
 except Exception as exc:raise HTTPException(503,"No configured Gamuur AI provider succeeded") from exc
