import { NextResponse } from "next/server";

export const runtime = "nodejs";

const providers = [
  ["gemini", "Gemini", "GEMINI_API_KEY"],
  ["kimi", "Kimi", "KIMI_API_KEY"],
  ["anthropic", "Claude", "ANTHROPIC_API_KEY"],
  ["groq", "Groq", "GROQ_API_KEY"],
  ["nvidia", "NVIDIA", "NVIDIA_API_KEY"],
  ["cerebras", "Cerebras", "CEREBRAS_API_KEY"],
  ["openrouter", "OpenRouter", "OPENROUTER_API_KEY"],
  ["huggingface", "Hugging Face", "HUGGINGFACE_API_KEY"],
  ["openai", "OpenAI", "OPENAI_API_KEY"],
] as const;

export async function GET() {
  return NextResponse.json({
    providers: providers.map(([id, name, env]) => ({ id, name, configured: Boolean(process.env[env]) })),
    auto: true,
  });
}
