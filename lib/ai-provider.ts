export type AIProvider = "openai" | "gemini" | "kimi" | "huggingface";

const providers: AIProvider[] = ["openai", "gemini", "kimi", "huggingface"];

function order(): AIProvider[] {
  const raw = String(process.env.AI_PROVIDER_ORDER || "openai,gemini,kimi,huggingface").split(",").map(x => x.trim().toLowerCase());
  return Array.from(new Set(raw.filter((x): x is AIProvider => providers.includes(x as AIProvider))));
}

function languageName(language: string) { return language === "so" ? "Somali" : language === "ar" ? "Arabic" : "English"; }

export async function generateAIText(language: string, prompt: string, payload: unknown) {
  const instructions = `You are Gamuur, a Somali-owned AI data analyst. Answer in ${languageName(language)}. Never call yourself ChatGPT. The user explicitly requested only this task: ${prompt}. Do not perform or claim to perform extra tasks. Use only supplied evidence; never invent numbers.`;
  const input = JSON.stringify(payload);
  const failures: string[] = [];

  for (const provider of order()) {
    try {
      let text: string | null = null;
      if (provider === "openai") text = await openAI(instructions, input);
      if (provider === "gemini") text = await gemini(instructions, input);
      if (provider === "kimi") text = await kimi(instructions, input);
      if (provider === "huggingface") text = await huggingFace(instructions, input);
      if (text) return { text, provider, fallback: failures.length > 0, failures };
      failures.push(`${provider}: empty response`);
    } catch (error) {
      failures.push(`${provider}: ${error instanceof Error ? error.message : "provider error"}`);
    }
  }
  return { text: null, provider: null, fallback: failures.length > 0, failures };
}

async function openAI(instructions: string, input: string) {
  const key = process.env.OPENAI_API_KEY; if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const r = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5-mini", instructions, input }) });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const d = await r.json(); return typeof d.output_text === "string" ? d.output_text : null;
}

async function gemini(instructions: string, input: string) {
  const key = process.env.GEMINI_API_KEY; if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: instructions }] }, contents: [{ role: "user", parts: [{ text: input }] }] }) });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const d = await r.json(); return d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("").trim() || null;
}

async function kimi(instructions: string, input: string) {
  const key = process.env.KIMI_API_KEY; if (!key) throw new Error("KIMI_API_KEY is not configured");
  const model = process.env.KIMI_MODEL || "kimi-k2";
  const base = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
  const r = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: "system", content: instructions }, { role: "user", content: input }] }) });
  if (!r.ok) throw new Error(`Kimi ${r.status}: ${await r.text()}`);
  const d = await r.json(); return typeof d?.choices?.[0]?.message?.content === "string" ? d.choices[0].message.content : null;
}

async function huggingFace(instructions: string, input: string) {
  const key = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN; if (!key) throw new Error("HUGGINGFACE_API_KEY is not configured");
  const model = process.env.HUGGINGFACE_MODEL || "Qwen/Qwen2.5-72B-Instruct";
  const r = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ inputs: `${instructions}\n\n${input}`, parameters: { max_new_tokens: 1200, return_full_text: false } }) });
  if (!r.ok) throw new Error(`Hugging Face ${r.status}: ${await r.text()}`);
  const d = await r.json(); const first = Array.isArray(d) ? d[0] : d; return typeof first?.generated_text === "string" ? first.generated_text : null;
}
