from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field

from app.api.deps import get_current_user_id
from app.core.config import get_settings

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    language: str = Field(default="en", pattern="^(en|so|ar)$")


class ChatResponse(BaseModel):
    answer: str
    language: str


SYSTEM_PROMPTS = {
    "en": "You are Gamuur, an economic intelligence assistant. Help people understand Gamuur, economics, data analysis, forecasting, research, business, policy, and related concepts. Explain clearly for non-data-scientists as well as experts. Never invent calculations, sources, or facts. If the user asks about their own dataset, explain that they should upload it so Gamuur can analyze the actual data.",
    "so": "Waxaad tahay Gamuur, kaaliye sirdoon dhaqaale. Ka caawi dadka inay fahmaan Gamuur, dhaqaalaha, falanqaynta xogta, saadaasha, cilmi-baarista, ganacsiga, siyaasadda iyo fikradaha la xiriira. Si cad ugu sharax dadka aan data-science aqoon badan u lahayn iyo khubaradaba. Ha been-abuurin xisaab, ilo ama xaqiiqooyin. Haddii isticmaaluhu ka hadlayo xogtiisa gaarka ah, u sheeg inuu soo geliyo xogta si Gamuur u falanqeeyo xogta dhabta ah.",
    "ar": "أنت Gamuur، مساعد للذكاء الاقتصادي. ساعد الناس على فهم Gamuur والاقتصاد وتحليل البيانات والتنبؤ والبحث والأعمال والسياسات والمفاهيم ذات الصلة. اشرح بوضوح لغير المتخصصين في علم البيانات وللخبراء أيضًا. لا تخترع حسابات أو مصادر أو حقائق. إذا سأل المستخدم عن بياناته الخاصة، وضّح أنه ينبغي رفعها حتى يتمكن Gamuur من تحليل البيانات الفعلية.",
}


@router.post("", response_model=ChatResponse)
def chat(body: ChatRequest, _user_id: str = Depends(get_current_user_id)) -> ChatResponse:
    settings = get_settings()
    token = settings.hf_token.get_secret_value() if settings.hf_token else ""
    if not token:
        raise HTTPException(status_code=503, detail="The Gamuur AI service is not configured yet.")

    try:
        client = OpenAI(api_key=token, base_url="https://router.huggingface.co/v1/")
        response = client.chat.completions.create(
            model=settings.hf_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPTS[body.language]},
                {"role": "user", "content": body.message},
            ],
        )
        answer = response.choices[0].message.content or "No answer was returned."
        return ChatResponse(answer=answer, language=body.language)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Gamuur could not reach the AI service right now.") from exc
