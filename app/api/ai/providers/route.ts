import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Keep this list aligned with lib/ai-provider.ts. We only expose whether a
// provider is configured; never return API keys or other secret values.
const providers = [
  ["gemini", "Gemini", ["GEMINI_API_KEY"]],
  ["kimi", "Kimi", ["KIMI_API_KEY"]],
  ["anthropic", "Claude", ["ANTHROPIC_API_KEY"]],
  ["nvidia", "NVIDIA", ["NVIDIA_API_KEY"]],
  ["groq", "Groq", ["GROQ_API_KEY"]],
  ["cerebras", "Cerebras", ["CEREBRAS_API_KEY"]],
  ["openrouter", "OpenRouter", ["OPENROUTER_API_KEY"]],
  ["huggingface", "Hugging Face", ["HUGGINGFACE_API_KEY", "HF_TOKEN"]],
  ["openai", "OpenAI", ["OPENAI_API_KEY"]],
] as const;

export async function GET() {
  const configured = providers
    .map(([id, name, envs]) => ({
      id,
      name,
      configured: envs.some((env) => Boolean(process.env[env])),
    }));

  return NextResponse.json({
    providers: configured,
    // Auto deliberately does not depend on OpenAI. The router's fallback
    // order starts with the non-OpenAI providers and only uses OpenAI when
    // explicitly configured in AI_PROVIDER_ORDER.
    auto: configured.some((provider) => provider.configured),
  });
}
