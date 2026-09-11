import { NextResponse } from "next/server";
import { generateAIText } from "../../lib/ai-provider";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const language = body?.language === "so" || body?.language === "ar" ? body.language : "en";
    if (!message) return NextResponse.json({ detail: "Message is required." }, { status: 400 });

    const languageName = language === "so" ? "Somali" : language === "ar" ? "Arabic" : "English";
    const ai = await generateAIText(language, message, {
      task: "general_chat",
      message,
      instruction: `You are Gamuur, a Somali-owned AI data analyst. Reply in ${languageName}. Never identify yourself as ChatGPT. Answer the user's request directly. If the request concerns data, ask them to upload the relevant dataset when needed. Do not claim to have analyzed data that was not supplied. Do not perform unrelated extra tasks.`
    });

    if (!ai.text) {
      return NextResponse.json({ detail: "Gamuur could not reach any configured AI provider. Please check the configured provider keys and quotas." }, { status: 503 });
    }

    return NextResponse.json({
      answer: ai.text,
      language,
      ai_provider: ai.provider,
      ai_fallback_used: ai.fallback,
      ai_provider_failures: ai.failures,
    });
  } catch (error) {
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Chat request failed." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "/chat", method: "POST" });
}
