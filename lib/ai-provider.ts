export type AIProvider = "openai" | "anthropic" | "gemini" | "kimi" | "huggingface" | "nvidia" | "groq" | "cerebras" | "openrouter";

const providers: AIProvider[] = ["openai", "anthropic", "gemini", "kimi", "huggingface", "nvidia", "groq", "cerebras", "openrouter"];

function order(): AIProvider[] {
  const raw = String(process.env.AI_PROVIDER_ORDER || "openai,anthropic,gemini,kimi,huggingface,nvidia,groq,cerebras,openrouter").split(",").map((x) => x.trim().toLowerCase());
  return Array.from(new Set(raw.filter((x): x is AIProvider => providers.includes(x as AIProvider))));
}
function languageName(language: string) { return language === "so" ? "Somali" : language === "ar" ? "Arabic" : "English"; }
function safeError(provider: string, status: number, body: string) {
  const clean = body.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]").replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]");
  return `${provider} ${status}: ${clean.slice(0, 300)}`;
}

async function request(url: string, init: RequestInit, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

export async function generateAIText(language: string, prompt: string, payload: unknown) {
  const instructions = `You are Gamuur, a Somali-owned AI data analyst. Answer in ${languageName(language)}. Never call yourself ChatGPT. The user explicitly requested only this task: ${prompt}. Do not perform or claim to perform extra tasks. Use only supplied evidence; never invent numbers.`;
  const input = JSON.stringify(payload);
  const failures: string[] = [];
  for (const provider of order()) {
    try {
      let text: string | null = null;
      if (provider === "openai") text = await openAI(instructions, input);
      else if (provider === "anthropic") text = await anthropic(instructions, input);
      else if (provider === "gemini") text = await gemini(instructions, input);
      else if (provider === "kimi") text = await kimi(instructions, input);
      else if (provider === "huggingface") text = await huggingFace(instructions, input);
      else if (provider === "nvidia") text = await nvidia(instructions, input);
      else if (provider === "groq") text = await groq(instructions, input);
      else if (provider === "cerebras") text = await cerebras(instructions, input);
      else if (provider === "openrouter") text = await openrouter(instructions, input);
      if (text?.trim()) return { text: text.trim(), provider, fallback: failures.length > 0, failures };
      failures.push(`${provider}: empty response`);
    } catch (error) {
      failures.push(`${provider}: ${error instanceof Error ? error.message : "provider error"}`);
    }
  }
  return { text: null, provider: null, fallback: failures.length > 0, failures };
}

async function openAI(instructions: string, input: string) {
  const key = process.env.OPENAI_API_KEY; if (!key) throw new Error("not configured");
  const r = await request("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5-mini", instructions, input }) });
  if (!r.ok) throw new Error(safeError("OpenAI", r.status, await r.text()));
  const d = await r.json(); return typeof d.output_text === "string" ? d.output_text : null;
}

async function anthropic(instructions: string, input: string) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error("not configured");
  const r = await request("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest", max_tokens: 1200, system: instructions, messages: [{ role: "user", content: input }] }) });
  if (!r.ok) throw new Error(safeError("Anthropic", r.status, await r.text()));
  const d = await r.json(); return Array.isArray(d?.content) ? d.content.filter((x: { type?: string; text?: string }) => x?.type === "text").map((x: { text?: string }) => x.text || "").join("").trim() : null;
}

async function gemini(instructions: string, input: string) {
  const key = process.env.GEMINI_API_KEY; if (!key) throw new Error("not configured");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: instructions }] }, contents: [{ role: "user", parts: [{ text: input }] }] }) });
  if (!r.ok) throw new Error(safeError("Gemini", r.status, await r.text()));
  const d = await r.json(); return d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("").trim() || null;
}

async function kimi(instructions: string, input: string) {
  const key = process.env.KIMI_API_KEY; if (!key) throw new Error("not configured");
  const model = process.env.KIMI_MODEL || "kimi-k2";
  const base = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
  return openAICompatible("Kimi", key, base, model, instructions, input);
}

async function huggingFace(instructions: string, input: string) {
  const key = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN; if (!key) throw new Error("not configured");
  const model = process.env.HUGGINGFACE_MODEL || "Qwen/Qwen2.5-72B-Instruct";
  const r = await request(`https://api-inference.huggingface.co/models/${model}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ inputs: `${instructions}\n\n${input}`, parameters: { max_new_tokens: 1200, return_full_text: false } }) });
  if (!r.ok) throw new Error(safeError("Hugging Face", r.status, await r.text()));
  const d = await r.json(); const first = Array.isArray(d) ? d[0] : d; return typeof first?.generated_text === "string" ? first.generated_text : null;
}

async function nvidia(instructions: string, input: string) {
  const key = process.env.NVIDIA_API_KEY; if (!key) throw new Error("not configured");
  const model = process.env.NVIDIA_MODEL || "moonshotai/kimi-k3";
  const base = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
  return openAICompatible("NVIDIA", key, base, model, instructions, input);
}

async function groq(instructions: string, input: string) {
  const key = process.env.GROQ_API_KEY; if (!key) throw new Error("not configured");
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
  const base = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
  return openAICompatible("Groq", key, base, model, instructions, input);
}

async function cerebras(instructions: string, input: string) {
  const key = process.env.CEREBRAS_API_KEY; if (!key) throw new Error("not configured");
  const model = process.env.CEREBRAS_MODEL || "gpt-oss-120b";
  const base = process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1";
  return openAICompatible("Cerebras", key, base, model, instructions, input);
}

async function openrouter(instructions: string, input: string) {
  const key = process.env.OPENROUTER_API_KEY; if (!key) throw new Error("not configured");
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  const base = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  return openAICompatible("OpenRouter", key, base, model, instructions, input);
}

async function openAICompatible(provider: string, key: string, base: string, model: string, instructions: string, input: string) {
  const r = await request(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0.2, max_tokens: 1200, stream: false, messages: [{ role: "system", content: instructions }, { role: "user", content: input }] })
  });
  if (!r.ok) throw new Error(safeError(provider, r.status, await r.text()));
  const d = await r.json();
  return typeof d?.choices?.[0]?.message?.content === "string" ? d.choices[0].message.content : null;
}
