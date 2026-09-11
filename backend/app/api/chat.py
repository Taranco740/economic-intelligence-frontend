from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.api.deps import get_current_user_id
from app.services.ai_router import AIRouter

router = APIRouter(prefix="/chat", tags=["chat"])

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    language: str = Field(default="en", pattern="^(en|so|ar)$")
    context: str = Field(default="", max_length=24000)

class ChatResponse(BaseModel):
    answer: str
    language: str
    ai_provider: str | None = None
    ai_fallback_used: bool = False
    ai_provider_failures: list[str] = []

SYSTEM_PROMPTS = {
    "en": "You are Gamur, a data-intelligence analyst. Answer questions about the user's supplied dataset and current analysis. Treat 'what else is missing', 'what should I investigate', and similar questions as questions about data coverage, quality, variables, evidence, and uncertainty—not questions about yourself. Use only supplied computed evidence and context. Never invent calculations or facts. Do not discuss your capabilities unless explicitly asked.",
    "so": "Waxaad tahay Gamur, falanqeeye xogeed. Ka jawaab su'aalaha ku saabsan dataset-ka iyo falanqaynta hadda jirta. Su'aalaha ku saabsan waxa ka maqan u fasir xogta, tayadeeda, doorsoomayaasheeda iyo caddaynteeda, ee ha ka hadlin naftaada. Isticmaal oo keliya caddaynta la bixiyay, hana been-abuurin xisaab ama xaqiiqo.",
    "ar": "أنت Gamur، محلل بيانات. أجب عن الأسئلة المتعلقة بمجموعة البيانات والتحليل الحالي. اعتبر أسئلة ما الذي ينقص كأسئلة عن جودة البيانات والمتغيرات والأدلة وعدم اليقين، وليس عن نفسك. استخدم الأدلة المقدمة فقط ولا تخترع حسابات أو حقائق.",
}

@router.post("", response_model=ChatResponse)
def chat(body: ChatRequest, _user_id: str = Depends(get_current_user_id)):
    try:
        context = body.context.strip()
        user_content = body.message if not context else f"CURRENT ANALYSIS CONTEXT:\n{context}\n\nUSER QUESTION:\n{body.message}"
        answer, provider, failures = AIRouter().complete(
            "question",
            [{"role": "system", "content": SYSTEM_PROMPTS[body.language]}, {"role": "user", "content": user_content}],
        )
        return ChatResponse(answer=answer, language=body.language, ai_provider=provider, ai_fallback_used=bool(failures), ai_provider_failures=failures)
    except Exception as exc:
        raise HTTPException(503, "No configured Gamur AI provider succeeded") from exc
