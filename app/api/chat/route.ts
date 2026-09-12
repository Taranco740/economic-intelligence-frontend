import { NextResponse } from "next/server";
import { generateAIText } from "../../../lib/ai-provider";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const context = typeof body?.context === "string" ? body.context : "";
    const language = body?.language === "so" || body?.language === "ar" || body?.language === "de" ? body.language : "en";
    const provider = typeof body?.provider === "string" ? body.provider.trim() || undefined : undefined;
    if (!message) return NextResponse.json({ detail: "Message is required." }, { status: 400 });

    const prompt = `${message}\n\nVerified Gamur data context:\n${context || "No dataset context is available yet."}`;
    const ai = await generateAIText(language, prompt, {
      task: "follow_up_data_question",
      instruction: "Answer using only the verified data context supplied by Gamur. Do not invent figures. If the request asks for a file or chart that the current endpoint cannot produce, explain what output should be generated next.",
      context,
    }, provider);

    return NextResponse.json({ answer: ai.text, language, ai_provider: ai.provider, ai_fallback_used: ai.fallback, ai_provider_failures: ai.failures });
  } catch (error) {
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Chat request failed." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "/api/chat", method: "POST" });
}
