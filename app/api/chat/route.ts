import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const language = body?.language === "so" || body?.language === "ar" ? body.language : "en";

    if (!message) {
      return NextResponse.json({ detail: "Message is required." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { detail: "OPENAI_API_KEY is not configured in Vercel." },
        { status: 500 }
      );
    }

    const languageName = language === "so" ? "Somali" : language === "ar" ? "Arabic" : "English";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions: `You are Gamuur, an AI data-analysis assistant. Reply in ${languageName}. Be concise, useful, and clear. If the user has not uploaded a dataset, help them understand what Gamuur can analyze and what data they should upload.`,
        input: message,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const detail = data?.error?.message || "OpenAI request failed.";
      return NextResponse.json({ detail }, { status: response.status });
    }

    const answer =
      typeof data?.output_text === "string"
        ? data.output_text
        : data?.output
            ?.flatMap((item: any) => item?.content || [])
            ?.map((item: any) => item?.text)
            ?.filter(Boolean)
            ?.join("\n") || "I could not generate a response.";

    return NextResponse.json({ answer, language });
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Chat request failed." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "/api/chat", method: "POST" });
}
