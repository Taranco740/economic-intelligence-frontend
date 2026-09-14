"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Provider = { id: string; name: string; configured: boolean };
type Message = { role: "user" | "assistant"; text: string; provider?: string; fallback?: boolean };

const fallbackProviders: Provider[] = [
  { id: "gemini", name: "Gemini", configured: false },
  { id: "kimi", name: "Kimi", configured: false },
  { id: "anthropic", name: "Claude", configured: false },
  { id: "nvidia", name: "NVIDIA", configured: false },
  { id: "groq", name: "Groq", configured: false },
  { id: "cerebras", name: "Cerebras", configured: false },
  { id: "openrouter", name: "OpenRouter", configured: false },
  { id: "huggingface", name: "Hugging Face", configured: false },
  { id: "openai", name: "OpenAI", configured: false },
];

export default function WorkspaceProviderFixed() {
  const [providers, setProviders] = useState<Provider[]>(fallbackProviders);
  const [provider, setProvider] = useState("auto");
  const [providerLoading, setProviderLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/ai/providers", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((body) => {
        if (!alive) return;
        const list = Array.isArray(body?.providers) ? body.providers : fallbackProviders;
        setProviders(list);
        setProvider((current) => current === "auto" || list.some((p: Provider) => p.id === current && p.configured) ? current : "auto");
      })
      .catch(() => { if (alive) setProviders(fallbackProviders); })
      .finally(() => { if (alive) setProviderLoading(false); });
    return () => { alive = false; };
  }, []);

  const configured = providers.filter((p) => p.configured);
  const intelligence = data?.intelligence || data;
  const analysis = intelligence?.analysis;
  const dataset = data?.dataset || intelligence?.dataset;
  const columns = Array.isArray(analysis?.columns) ? analysis.columns.length : (Array.isArray(dataset?.columns) ? dataset.columns.length : analysis?.columns ?? dataset?.columns);

  function chooseFile(f: File) {
    setFile(f); setData(null); setMessages([]); setError("");
    setPrompt("Analyze this data and tell me what matters.");
  }

  async function analyze() {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("prompt", prompt.trim() || "Understand this dataset and tell me what matters.");
      form.append("language", "en");
      if (provider !== "auto") form.append("provider", provider);
      const r = await fetch("/api/analyst", { method: "POST", body: form });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.detail || `Analysis failed (${r.status}).`);
      setData(body);
      setMessages([
        { role: "user", text: prompt.trim() || "Understand this data and tell me what matters." },
        { role: "assistant", text: body.story || body.insights || "Analysis completed.", provider: body.ai_provider, fallback: body.ai_fallback_used }
      ]);
      setPrompt("");
    } catch (e) { setError(e instanceof Error ? e.message : "Gamur could not analyze this file."); }
    finally { setBusy(false); }
  }

  async function ask() {
    const q = prompt.trim();
    if (!q || !data || busy) return;
    setMessages((m) => [...m, { role: "user", text: q }]); setPrompt(""); setBusy(true); setError("");
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q, context: JSON.stringify({ dataset, intelligence }), language: "en", provider: provider === "auto" ? undefined : provider }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.detail || `Request failed (${r.status}).`);
      setMessages((m) => [...m, { role: "assistant", text: body.answer || "No answer was returned.", provider: body.ai_provider, fallback: body.ai_fallback_used }]);
    } catch (e) { setMessages((m) => [...m, { role: "assistant", text: e instanceof Error ? e.message : "Assistant unavailable." }]); }
    finally { setBusy(false); }
  }

  function submit() { if (data) void ask(); else void analyze(); }
  function reset() { setFile(null); setData(null); setMessages([]); setPrompt(""); setError(""); if (inputRef.current) inputRef.current.value = ""; }

  return <div className="gw">
    <aside className="side"><button className="new" onClick={reset}>＋ New conversation</button><div className="sideTitle">GAMUR</div><p className="sideCopy">Evidence first · AI second</p><div className="sideStatus"><span className="dot" />{providerLoading ? "Loading AI providers…" : `${configured.length} AI providers ready`}</div></aside>
    <main className="main">
      <header className="bar"><a className="brand" href="/">G<span>amur</span></a><div className="title"><b>Data workspace</b><small>{file ? file.name : "Upload a dataset and tell Gamur what you need."}</small></div><ProviderPicker providers={providers} value={provider} onChange={setProvider} loading={providerLoading} /></header>
      <section className="content">{!data ? <div className="welcome"><span className="eyebrow">GAMUR · AI DATA WORKSPACE</span><h1>Bring your data.<br /><i>Choose the intelligence.</i></h1><p>Upload CSV or Excel, choose exactly which AI you want, and Gamur will use that provider for your request.</p><div className="actions"><button onClick={() => inputRef.current?.click()}><strong>＋</strong><b>{file ? "Change dataset" : "Attach your data"}</b><small>CSV, XLSX or XLS · up to 25 MB</small></button><button disabled={!file} onClick={() => setPrompt("Analyze this data and give me a full report.")}><strong>▥</strong><b>Full analysis</b><small>Find what matters</small></button><button disabled={!file} onClick={() => setPrompt("Clean this data and explain the quality issues.")}><strong>✓</strong><b>Clean data</b><small>Prepare reliable data</small></button><button disabled={!file} onClick={() => setPrompt("Make a useful chart from this data and explain what it shows.")}><strong>▤</strong><b>Make a chart</b><small>Visualize evidence</small></button></div>{file && <div className="attachment"><span>✓</span><div><b>{file.name}</b><small>{(file.size / 1024 / 1024).toFixed(2)} MB · ready</small></div><button onClick={reset}>Remove</button></div>}<div className="providerBox"><div><b>AI provider</b><small>{provider === "auto" ? "Auto will use the best configured provider and fall back if needed." : `Selected: ${providers.find((p) => p.id === provider)?.name || provider}`}</small></div><ProviderPicker providers={providers} value={provider} onChange={setProvider} loading={providerLoading} large /></div>{file && <button className="primary" onClick={submit} disabled={busy}>{busy ? "Analyzing…" : `Analyze with ${provider === "auto" ? "Auto" : providers.find((p) => p.id === provider)?.name || provider} →`}</button>}</div> : <div className="results"><div className="dataset"><div><span className="eyebrow">UNDERSTOOD DATASET</span><h2>{file?.name}</h2><p>Verified dataset context</p></div><div className="stats"><span><b>{analysis?.rows ?? dataset?.rows ?? "—"}</b> rows</span><span><b>{columns ?? "—"}</b> columns</span><span><b>{dataset?.quality_score ?? "—"}</b> quality</span></div></div><div className="messages">{messages.map((m, i) => <article className={m.role} key={i}><header><b>{m.role === "user" ? "You" : "Gamur"}</b>{m.provider && <small>{providers.find((p) => p.id === m.provider)?.name || m.provider}{m.fallback ? " · fallback used" : ""}</small>}</header><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown></article>)}</div></div>}</section>
      {error && <div className="error">{error}</div>}
      <footer className="composer"><input ref={inputRef} hidden type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) chooseFile(f); }} /><button onClick={() => inputRef.current?.click()} aria-label="Attach file">＋</button><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder={data ? "Ask Gamur anything about this data…" : file ? "Describe what you want, then press Analyze…" : "Attach data, then tell Gamur what you need…"} /><ProviderPicker providers={providers} value={provider} onChange={setProvider} loading={providerLoading} /><button className="send" disabled={busy || (!file && !data) || !prompt.trim()} onClick={submit}>{busy ? "…" : "↑"}</button></footer>
    </main>
    <style jsx>{`*{box-sizing:border-box}.gw{min-height:100vh;display:grid;grid-template-columns:240px 1fr;background:#f7f8fa;color:#17202a;font-family:Inter,system-ui,sans-serif}.side{background:#eef1f3;border-right:1px solid #dce2e6;padding:18px}.new{width:100%;border:1px solid #cfd7dd;background:white;border-radius:10px;padding:11px 12px;text-align:left;font-weight:700;cursor:pointer}.sideTitle{margin-top:32px;font-size:12px;letter-spacing:.16em;color:#64707b}.sideCopy{font-size:13px;color:#71808c}.sideStatus{margin-top:22px;border-top:1px solid #d8dee3;padding-top:16px;font-size:12px;color:#66737d}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#3d8a5a;margin-right:7px}.main{min-width:0;display:flex;flex-direction:column;min-height:100vh}.bar{height:72px;border-bottom:1px solid #dfe4e8;background:white;display:flex;align-items:center;padding:0 28px;gap:22px}.brand{font-size:21px;font-weight:800;color:#142a4a;text-decoration:none}.title{display:flex;flex-direction:column;flex:1}.title b{font-size:15px}.title small{color:#74808b;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ai{display:flex;align-items:center;gap:8px;font-size:12px;color:#6d7881}.ai select,.providerPicker select{border:1px solid #c7d1d9;border-radius:9px;padding:10px 12px;background:white;color:#17202a;font-weight:700;cursor:pointer;min-width:150px}.providerPicker{display:flex;align-items:center;gap:7px}.providerPickerLabel{font-size:11px;color:#6d7881;font-weight:800}.providerPicker select:focus{outline:2px solid #a9bfd8;outline-offset:1px}.providerBox{margin-top:22px;padding:14px 16px;border:1px solid #d4dde3;background:#fff;border-radius:12px;display:flex;align-items:center;gap:18px;justify-content:space-between}.providerBox>div{display:flex;flex-direction:column;gap:3px}.providerBox small{color:#75818a;line-height:1.4}.providerPicker.large select{min-width:220px;font-size:14px;padding:11px 13px}.content{flex:1;overflow:auto}.welcome{max-width:980px;margin:0 auto;padding:60px 34px 120px}.eyebrow{font-size:11px;letter-spacing:.15em;color:#6b7882;font-weight:800}.welcome h1{font-size:48px;line-height:1.05;margin:14px 0;color:#172b47;letter-spacing:-.04em}.welcome h1 i{font-family:Georgia,serif;font-weight:400;color:#42679c}.welcome>p{max-width:680px;font-size:16px;line-height:1.6;color:#65717b}.actions{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:30px}.actions button{min-height:125px;text-align:left;border:1px solid #d9e0e4;background:white;border-radius:13px;padding:17px;cursor:pointer;box-shadow:0 2px 8px #172b4708}.actions button:disabled{opacity:.5;cursor:not-allowed}.actions strong{display:block;font-size:21px;color:#315d99;margin-bottom:17px}.actions b{display:block;font-size:14px}.actions small{display:block;margin-top:5px;color:#7a858d;line-height:1.35}.attachment{margin-top:18px;padding:12px 14px;border:1px solid #cddbe6;background:#fff;border-radius:10px;display:flex;align-items:center;gap:10px}.attachment>span{font-weight:800;color:#2d7a4d}.attachment div{flex:1}.attachment b,.attachment small{display:block}.attachment small{color:#7a858d;margin-top:2px}.attachment button{border:0;background:none;color:#6c7882;cursor:pointer}.primary{margin-top:18px;border:0;border-radius:10px;background:#17365f;color:white;padding:12px 18px;font-weight:800;cursor:pointer}.primary:disabled{opacity:.6}.results{max-width:1000px;margin:0 auto;padding:30px 34px 120px}.dataset{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #dfe4e8;padding-bottom:20px}.dataset h2{margin:6px 0 2px;font-size:24px}.dataset p{margin:0;color:#7a858d}.stats{display:flex;gap:24px;align-items:end}.stats span{font-size:12px;color:#74808b}.stats b{font-size:20px;color:#172b47;margin-right:4px}.messages{margin-top:28px}.messages article{padding:18px 20px;margin-bottom:14px;border-radius:12px;border:1px solid #e0e5e8;background:white}.messages article.user{background:#f0f4f7}.messages article header{display:flex;gap:10px;align-items:center;margin-bottom:8px}.messages article header small{color:#75818a}.messages article p{line-height:1.6}.messages article table{width:100%;border-collapse:collapse}.messages article th,.messages article td{border:1px solid #dfe4e8;padding:7px;text-align:left}.composer{position:sticky;bottom:0;display:flex;gap:8px;padding:14px 24px;background:#ffffffee;border-top:1px solid #dfe4e8;backdrop-filter:blur(8px)}.composer>button{width:42px;border:1px solid #d2d9de;background:white;border-radius:9px;font-size:20px;cursor:pointer}.composer textarea{flex:1;min-height:42px;max-height:130px;resize:none;border:1px solid #d2d9de;border-radius:9px;padding:11px 12px;font:inherit;outline:none}.composer textarea:focus{border-color:#6f8fb4}.composer .send{background:#17365f;color:white}.composer .send:disabled{opacity:.45;cursor:not-allowed}.error{position:fixed;right:22px;bottom:84px;max-width:520px;background:#fff1f1;border:1px solid #e5b8b8;color:#8b2f2f;border-radius:10px;padding:12px 15px;box-shadow:0 8px 30px #0001;z-index:20}@media(max-width:850px){.gw{grid-template-columns:1fr}.side{display:none}.bar{padding:0 16px}.bar>.providerPicker{display:none}.providerBox{align-items:flex-start;flex-direction:column}.providerPicker.large{width:100%}.providerPicker.large select{width:100%}.actions{grid-template-columns:1fr 1fr}.welcome{padding:40px 20px}.welcome h1{font-size:38px}.dataset{display:block}.stats{margin-top:15px;flex-wrap:wrap}.composer{padding:10px}.composer .providerPicker{display:flex}.composer .providerPicker select{min-width:130px;max-width:180px}}`}</style>
  </div>;
}

function ProviderPicker({ providers, value, onChange, loading, large = false }: { providers: Provider[]; value: string; onChange: (v: string) => void; loading: boolean; large?: boolean }) {
  return <label className={`providerPicker ${large ? "large" : ""}`}><span className="providerPickerLabel">{large ? "Choose AI" : "AI"}</span><select value={value} onChange={(e) => onChange(e.target.value)} disabled={loading}><option value="auto">Auto · best available</option>{providers.map((p) => <option key={p.id} value={p.id} disabled={!p.configured}>{p.name}{p.configured ? "" : " · not configured"}</option>)}</select></label>;
}
