"use client";

import { useMemo, useRef, useState } from "react";
import { downloadAnalyticsPdf, downloadStatisticsWorkbook } from "../../lib/exports";

type Provider = { id: string; name: string; configured: boolean };
type Message = { role: "user" | "assistant"; text: string; provider?: string; fallback?: boolean };
type AnalystPayload = any;

const providerNames: Record<string, string> = {
  auto: "Auto",
  gemini: "Gemini",
  kimi: "Kimi",
  anthropic: "Claude",
  groq: "Groq",
  nvidia: "NVIDIA",
  cerebras: "Cerebras",
  openrouter: "OpenRouter",
  huggingface: "Hugging Face",
  openai: "OpenAI",
};

function shortTitle(file: File, request: string) {
  const clean = request.replace(/\s+/g, " ").trim();
  if (clean) return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
  return file.name.replace(/\.(csv|xlsx|xls)$/i, "");
}

function Markdown({ text }: { text: string }) {
  return <div className="markdown">{String(text || "").split(/\r?\n/).map((line, i) => {
    const value = line.trim();
    if (!value) return <div key={i} className="space" />;
    if (/^#{1,4}\s/.test(value)) return <h3 key={i}>{value.replace(/^#{1,4}\s+/, "")}</h3>;
    if (/^[-*]\s+/.test(value)) return <p key={i}>• {value.replace(/^[-*]\s+/, "")}</p>;
    return <p key={i}>{value}</p>;
  })}</div>;
}

export default function Workspace() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState("auto");
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<AnalystPayload | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Array<{ title: string; date: string; data: AnalystPayload }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useMemo(() => {
    fetch("/api/ai/providers", { cache: "no-store" }).then(r => r.json()).then(body => {
      const configured = (body.providers || []).filter((item: Provider) => item.configured);
      setProviders(configured);
      if (!configured.some((item: Provider) => item.id === provider) && provider !== "auto") setProvider("auto");
    }).catch(() => setProviders([]));
  }, [provider]);

  const intelligence = data?.intelligence || data;
  const analysis = intelligence?.analysis;
  const datasetInfo = data?.dataset || intelligence?.dataset;
  const relationships = analysis?.relationships || intelligence?.visualization?.relationships || [];
  const charts = intelligence?.visualization?.charts || [];
  const selectedProviderName = provider === "auto" ? "Auto" : providerNames[provider] || provider;

  const analyze = async (chosenFile: File, request: string) => {
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.append("file", chosenFile);
      form.append("prompt", request || "Understand this dataset, identify what matters, and prepare reusable evidence for the requested work.");
      form.append("language", "en");
      if (provider !== "auto") form.append("provider", provider);
      const response = await fetch("/api/analyst", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.detail || `Analysis failed (${response.status}).`);
      setFile(chosenFile); setData(payload);
      setMessages([{ role: "user", text: request || "Understand this data and tell me what matters." }, { role: "assistant", text: payload.story || payload.insights || "I understood the dataset and prepared the evidence.", provider: payload.ai_provider, fallback: payload.ai_fallback_used }]);
      setHistory(items => [{ title: shortTitle(chosenFile, request), date: new Date().toISOString(), data: payload }, ...items.filter(item => item.title !== shortTitle(chosenFile, request))].slice(0, 20));
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gamur could not complete the request.");
    } finally { setBusy(false); }
  };

  const ask = async () => {
    const question = prompt.trim();
    if (!question || busy) return;
    if (!data) {
      setError("Attach a dataset first so Gamur can answer from verified evidence.");
      return;
    }
    setMessages(items => [...items, { role: "user", text: question }]);
    setPrompt(""); setBusy(true); setError("");
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question, context: JSON.stringify({ dataset: datasetInfo, intelligence }), language: "en", provider: provider === "auto" ? undefined : provider }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.detail || `Request failed (${response.status}).`);
      setMessages(items => [...items, { role: "assistant", text: body.answer || "I could not generate a response.", provider: body.ai_provider, fallback: body.ai_fallback_used }]);
    } catch (e) {
      setMessages(items => [...items, { role: "assistant", text: e instanceof Error ? e.message : "Assistant unavailable." }]);
    } finally { setBusy(false); }
  };

  const newConversation = () => { setFile(null); setData(null); setMessages([]); setPrompt(""); setError(""); if (inputRef.current) inputRef.current.value = ""; };

  const requestOutput = (kind: string) => {
    const requests: Record<string, string> = {
      slides: "Turn this verified analysis into a professional executive PowerPoint presentation with a strong cover, KPI summary, findings, charts, methodology, limitations and recommendations.",
      forecast: "Using the verified evidence, prepare a professional statistical forecasting specification with the target, horizon, method, assumptions, confidence considerations and charts for an Excel workbook.",
      report: "Turn this verified analysis into a complete professional executive report with a cover, KPI summary, findings, charts, methodology, limitations and recommendations.",
    };
    setPrompt(requests[kind] || "Create the requested output from this verified analysis.");
  };

  return <div className="workspaceShell">
    <aside className="sidebar">
      <div className="brand"><span className="brandMark">G</span><span>Gamur</span></div>
      <button className="newButton" onClick={newConversation}>＋ New conversation</button>
      <div className="sideLabel">RECENT</div>
      <div className="historyList">
        {history.length ? history.map((item, i) => <button className="historyItem" key={`${item.date}-${i}`} onClick={() => { setData(item.data); setMessages([{ role: "assistant", text: item.data.story || item.data.insights || "Saved analysis loaded.", provider: item.data.ai_provider }]); }}><strong>{item.title}</strong><small>{new Date(item.date).toLocaleDateString()}</small></button>) : <p className="empty">Your analyses will appear here.</p>}
      </div>
      <div className="sidebarFoot">Evidence first · AI second</div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><b>Data workspace</b><span>{file ? `${file.name} · ${datasetInfo?.rows?.toLocaleString?.() || "—"} rows · ${datasetInfo?.columns?.length || datasetInfo?.columns || "—"} columns` : "Upload a dataset and tell Gamur what you need."}</span></div>
        <div className="topActions">
          <label className="providerLabel">AI</label>
          <select value={provider} onChange={e => setProvider(e.target.value)}><option value="auto">Auto · best available</option>{providers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <a href="/settings" className="iconButton">⚙</a>
          <a href="/profile" className="avatar">G</a>
        </div>
      </header>

      <section className="conversation">
        {!data ? <div className="welcome">
          <div className="eyebrow">GAMUR · AI DATA WORKSPACE</div>
          <h1>Bring your data.<br /><em>Choose the intelligence.</em></h1>
          <p>Gamur understands your data first. Then you choose the AI that is best for the job—analysis, slides, forecasting, reporting, or anything else you need.</p>
          <div className="welcomeGrid">
            <button onClick={() => inputRef.current?.click()}><span>＋</span><b>Attach your data</b><small>CSV, XLSX or XLS</small></button>
            <button onClick={() => setPrompt("Analyze this data and give me a full report.")}><span>⌁</span><b>Full analysis</b><small>Find what matters</small></button>
            <button onClick={() => setPrompt("Clean this data and give me the best organized dataset." )}><span>✓</span><b>Clean data</b><small>Prepare a reliable dataset</small></button>
            <button onClick={() => setPrompt("Make a useful chart from this data and explain what it shows.")}><span>▥</span><b>Make a chart</b><small>Visualize evidence</small></button>
          </div>
          <div className="providerStrip"><span>Configured AI</span>{providers.length ? providers.map(p => <span className="providerChip" key={p.id}>{p.name}</span>) : <span className="muted">No provider keys detected yet</span>}</div>
        </div> : <>
          <div className="datasetBar"><div><span className="eyebrow">UNDERSTOOD DATASET</span><h2>{file?.name || "Dataset"}</h2></div><div className="datasetStats"><span><b>{analysis?.rows?.toLocaleString?.() || datasetInfo?.rows?.toLocaleString?.() || "—"}</b> rows</span><span><b>{analysis?.columns || "—"}</b> columns</span><span><b>{datasetInfo?.quality_score ?? intelligence?.dataset?.quality_score ?? "—"}</b> quality</span></div></div>
          <div className="messages">{messages.map((m, i) => <div className={m.role === "user" ? "message user" : "message assistant"} key={i}><div className="messageHead"><b>{m.role === "user" ? "You" : "Gamur"}</b>{m.provider && <span>{providerNames[m.provider] || m.provider}{m.fallback ? " · fallback used" : ""}</span>}</div><Markdown text={m.text} /></div>)}</div>
          {(analysis || relationships.length) && <section className="evidence"><div className="sectionHead"><div><span className="eyebrow">VERIFIED EVIDENCE</span><h2>What the data says</h2></div><span>Source of truth for every output</span></div><div className="kpiGrid"><div><small>Observations</small><b>{analysis?.rows?.toLocaleString?.() || "—"}</b></div><div><small>Numeric fields</small><b>{analysis?.numeric_columns?.length || 0}</b></div><div><small>Questions</small><b>{intelligence?.questions?.length || 0}</b></div><div><small>Outlier flags</small><b>{(analysis?.outliers || []).reduce((n: number, x: any) => n + (x.count || 0), 0)}</b></div></div>{relationships.slice(0, 4).length > 0 && <div className="findingGrid">{relationships.slice(0, 4).map((r: any, i: number) => <div className="finding" key={i}><span>{r.strength || "Association"}</span><b>{r.x} ↔ {r.y}</b><strong>r = {Number(r.r).toFixed(2)}</strong><small>Measured relationship in the observed data</small></div>)}</div>}
            {charts.slice(0, 2).map((chart: any, i: number) => <div className="chartCard" key={i}><div><span className="eyebrow">VISUAL EVIDENCE</span><h3>{chart.title || "Data chart"}</h3></div><div className="chartBars">{(chart.data || []).slice(0, 12).map((row: any, j: number) => { const value = Number(row[chart.yKey]); const max = Math.max(...(chart.data || []).map((x: any) => Number(x[chart.yKey]) || 0), 1); return <div className="barRow" key={j}><span>{String(row[chart.xKey] ?? "").slice(0, 18)}</span><i style={{ width: `${Math.max(3, Math.min(100, Math.abs(value / max) * 100))}%` }} /><b>{Number.isFinite(value) ? value.toLocaleString() : "—"}</b></div>; })}</div></div>)}
          </section>}
          <section className="outputPanel"><div><span className="eyebrow">OUTPUTS</span><h2>Use the same evidence for the next job</h2><p>Choose another AI provider or ask Gamur to prepare a specific deliverable. Nothing needs to be re-analyzed from scratch.</p></div><div className="outputGrid"><button onClick={() => downloadAnalyticsPdf(file?.name || "Gamur analysis", intelligence)}>PDF report</button><button onClick={() => downloadStatisticsWorkbook(file?.name || "Gamur analysis", intelligence)}>Excel analysis</button><button onClick={() => requestOutput("slides")}>Ask for PowerPoint</button><button onClick={() => requestOutput("forecast")}>Ask for forecast Excel</button></div></section>
        </>}
      </section>

      {error && <div className="errorToast">{error}</div>}
      <footer className="composer"><input ref={inputRef} hidden type="file" accept=".csv,.xlsx,.xls" onChange={e => { const f = e.target.files?.[0]; if (!f) return; setFile(f); setPrompt("Analyze this data and tell me what matters."); }} /><button className="attach" onClick={() => inputRef.current?.click()} aria-label="Attach data">＋</button><textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (file && !data) void analyze(file, prompt); else void ask(); } }} placeholder={data ? "Ask Gamur anything about this data…" : "Attach data, then tell Gamur what you want…"} /><select className="composerProvider" value={provider} onChange={e => setProvider(e.target.value)}><option value="auto">Auto</option>{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="send" disabled={busy} onClick={() => { if (file && !data) void analyze(file, prompt); else void ask(); }}>{busy ? "…" : "↑"}</button></footer>
    </main>

    <style jsx>{`
      .workspaceShell{min-height:calc(100vh - 62px);display:grid;grid-template-columns:250px minmax(0,1fr);background:#f7f8fa;color:#18212b}.sidebar{border-right:1px solid #dfe4e8;background:#f1f3f4;padding:18px 14px;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:850;letter-spacing:-.03em;padding:3px 7px 22px}.brandMark{width:31px;height:31px;border-radius:9px;background:#142536;color:#fff;display:grid;place-items:center}.newButton{width:100%;padding:10px 12px;text-align:left;border:1px solid #d6dde2;border-radius:9px;background:#fff;font-weight:700;font-size:12px;color:#25313d}.sideLabel,.eyebrow{font-size:8px;letter-spacing:.18em;font-weight:800;color:#84909b}.sideLabel{padding:25px 7px 9px}.historyList{display:grid;gap:4px}.historyItem{border:0;background:transparent;text-align:left;border-radius:8px;padding:9px 8px;display:grid;gap:3px;cursor:pointer}.historyItem:hover{background:#fff}.historyItem strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.historyItem small,.empty{font-size:9px;color:#89939d}.sidebarFoot{margin-top:auto;padding:12px 7px;font-size:9px;color:#8c969f}.main{min-width:0;display:flex;flex-direction:column;height:calc(100vh - 62px)}.topbar{height:62px;border-bottom:1px solid #dfe4e8;background:#fbfcfd;display:flex;align-items:center;justify-content:space-between;padding:0 22px;gap:16px}.topbar>div:first-child{display:grid;gap:3px}.topbar b{font-size:12px}.topbar span{font-size:9px;color:#87919a}.topActions{display:flex!important;align-items:center;gap:8px}.topActions select,.composerProvider{border:1px solid #d4dbe0;border-radius:8px;background:#fff;padding:8px 10px;font-size:10px;color:#26333f}.providerLabel{font-size:8px!important;font-weight:800;color:#8a949d!important}.iconButton,.avatar{display:grid;place-items:center;width:30px;height:30px;border:1px solid #d4dbe0;border-radius:8px;background:#fff;color:#52606c;text-decoration:none;font-size:11px}.avatar{border-radius:50%;background:#142536;color:#fff;border:0}.conversation{flex:1;overflow:auto;padding:38px 5vw 145px}.welcome{max-width:920px;margin:5vh auto 0}.welcome h1{font-size:50px;line-height:1.02;letter-spacing:-.055em;margin:12px 0 15px}.welcome h1 em{font-style:normal;color:#66727e}.welcome>p{max-width:650px;font-size:14px;line-height:1.7;color:#65717d}.welcomeGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:28px}.welcomeGrid button{border:1px solid #dce2e6;background:#fff;border-radius:12px;padding:17px;text-align:left;display:grid;gap:7px;cursor:pointer}.welcomeGrid button:hover{border-color:#aeb8c0;transform:translateY(-1px)}.welcomeGrid span{font-size:19px}.welcomeGrid b{font-size:11px}.welcomeGrid small{font-size:9px;color:#8b959e}.providerStrip{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:28px;font-size:9px;color:#87919a}.providerChip{border:1px solid #d7dee3;background:#fff;border-radius:999px;padding:5px 8px;color:#44515c}.muted{color:#89939d}.datasetBar{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid #e0e5e9;padding-bottom:20px;margin-bottom:22px}.datasetBar h2{font-size:25px;letter-spacing:-.04em;margin:6px 0 0}.datasetStats{display:flex;gap:20px}.datasetStats span{font-size:9px;color:#89939d}.datasetStats b{font-size:15px;color:#25313d;margin-right:4px}.messages{max-width:900px;margin:auto}.message{margin:20px 0}.message.user{margin-left:auto;max-width:680px;background:#eaf0f4;border-radius:16px 16px 4px 16px;padding:14px 17px}.message.assistant{max-width:820px}.messageHead{display:flex;gap:9px;align-items:center;margin-bottom:8px}.messageHead b{font-size:10px}.messageHead span{font-size:8px;border:1px solid #dce2e6;border-radius:999px;padding:4px 7px;color:#77828c;background:#fff}.markdown p{font-size:12px;line-height:1.75;margin:5px 0;color:#35424e}.markdown h3{font-size:14px;margin:14px 0 5px}.space{height:4px}.evidence,.outputPanel{max-width:900px;margin:30px auto 0}.sectionHead{display:flex;justify-content:space-between;align-items:end;margin-bottom:12px}.sectionHead h2,.outputPanel h2{font-size:20px;letter-spacing:-.035em;margin:6px 0}.sectionHead>span,.outputPanel p{font-size:9px;color:#89939d}.kpiGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.kpiGrid>div,.finding,.chartCard,.outputPanel{background:#fff;border:1px solid #dce2e6;border-radius:12px;padding:14px}.kpiGrid small{display:block;font-size:8px;color:#8a949e;margin-bottom:8px}.kpiGrid b{font-size:21px}.findingGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-top:9px}.finding{display:grid;gap:5px}.finding span{font-size:8px;text-transform:uppercase;letter-spacing:.1em;color:#7d8993}.finding b{font-size:11px}.finding strong{font-size:13px}.finding small{font-size:8px;color:#8a949e}.chartCard{margin-top:9px}.chartCard h3{font-size:12px;margin:6px 0 12px}.chartBars{display:grid;gap:6px}.barRow{display:grid;grid-template-columns:110px 1fr 70px;gap:8px;align-items:center;font-size:8px}.barRow i{height:8px;border-radius:99px;background:#203446;display:block}.barRow b{text-align:right;font-size:8px}.outputPanel{display:flex;justify-content:space-between;gap:20px;align-items:center}.outputPanel p{max-width:560px;line-height:1.6}.outputGrid{display:grid;grid-template-columns:1fr 1fr;gap:7px;min-width:230px}.outputGrid button{border:1px solid #cfd7dd;background:#fff;border-radius:8px;padding:9px;font-size:9px;cursor:pointer}.outputGrid button:hover{background:#f1f4f6}.composer{position:fixed;bottom:0;left:250px;right:0;display:grid;grid-template-columns:42px minmax(0,1fr) 105px 40px;gap:7px;align-items:end;padding:18px 5vw 20px;background:linear-gradient(transparent,#f7f8fa 24%)}.composer textarea{min-height:50px;max-height:150px;resize:none;border:1px solid #cfd7dd;background:#fff;border-radius:13px;padding:12px 14px;font:inherit;font-size:11px;outline:none;box-shadow:0 5px 20px #1625360b}.attach,.send{height:42px;border:1px solid #d3dae0;background:#fff;border-radius:10px;font-size:17px;cursor:pointer}.send{background:#142536;color:#fff;border-color:#142536}.errorToast{position:fixed;right:28px;bottom:105px;max-width:420px;background:#fff0ee;border:1px solid #edc8c3;color:#963e38;border-radius:9px;padding:10px;font-size:9px;z-index:10}@media(max-width:900px){.workspaceShell{grid-template-columns:1fr}.sidebar{display:none}.composer{left:0}.welcome h1{font-size:39px}.welcomeGrid,.kpiGrid{grid-template-columns:1fr 1fr}.outputPanel{display:grid}.topbar{padding:0 14px}.topbar>div:first-child span{display:none}.conversation{padding-left:18px;padding-right:18px}.datasetStats{gap:8px}.datasetStats span:nth-child(3){display:none}}@media(max-width:560px){.welcomeGrid,.kpiGrid,.findingGrid{grid-template-columns:1fr}.composer{grid-template-columns:38px minmax(0,1fr) 38px}.composerProvider{display:none}.topActions select{max-width:100px}.datasetBar{display:block}.datasetStats{margin-top:12px}}
    `}</style>
  </div>;
}
