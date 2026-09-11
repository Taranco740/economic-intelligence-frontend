"use client";

import Link from "next/link";
import { ChangeEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase-browser";
import { runAnalyst, sendChat } from "../lib/api";
import { useLanguage } from "./components/language-provider";

type Message = { role: "user" | "assistant"; text: string; result?: any };

type Lang = "en" | "so" | "ar";

export default function Home() {
  const { language, setLanguage, t } = useLanguage();
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [gate, setGate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setOnline(true); }, []);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    if (!/\.(csv|xlsx|xls)$/i.test(picked.name)) {
      setMessages((m) => [...m, { role: "assistant", text: language === "so" ? "Fadlan geli CSV ama Excel." : language === "ar" ? "يرجى رفع ملف CSV أو Excel." : "Please upload a CSV or Excel file." }]);
      return;
    }
    setFile(picked);
  };

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setMessages((m) => [...m, { role: "user", text: prompt }]);
    setInput("");
    const sb = createSupabaseBrowserClient();
    if (!sb) { setGate(true); return; }
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) { setGate(true); return; }
    setBusy(true);
    try {
      if (file) {
        const result = await runAnalyst(session.access_token, prompt, language as Lang, file);
        setMessages((m) => [...m, { role: "assistant", text: result.insights, result }]);
        setFile(null);
      } else {
        const response = await sendChat(session.access_token, prompt, language as Lang);
        setMessages((m) => [...m, { role: "assistant", text: response.answer }]);
      }
    } catch (error) {
      setMessages((m) => [...m, { role: "assistant", text: error instanceof Error ? error.message : "Gamuur could not process this request." }]);
    } finally { setBusy(false); }
  };

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
  };

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand"><b>G</b><span>Gamuur</span></div>
        <button className="newChat" onClick={() => { setMessages([]); setFile(null); }}>＋ {t.newChat}</button>
        <div className="sectionLabel">ANALYST</div>
        <div className="capabilities">
          <span>✓ Understand data</span><span>✓ Clean & validate</span><span>✓ Analyze & discover</span><span>✓ Visualize</span><span>✓ Forecast</span><span>✓ Create reports</span>
        </div>
        <div className="spacer" />
        <span className="status">● {online ? "System online" : "Checking system"}</span>
        <Link href="/settings">⚙ {t.settings}</Link><Link href="/profile">◯ {t.profile}</Link>
      </aside>
      <section className="main">
        <header><span>Economic Intelligence</span><nav><Link href="/about">{t.about}</Link><Link href="/auth?mode=login">{t.signIn}</Link><select aria-label="Language" value={language} onChange={(e) => setLanguage(e.target.value as Lang)}><option value="en">EN</option><option value="so">SO</option><option value="ar">ع</option></select></nav></header>
        <div className="body">
          {!messages.length ? <div className="welcome"><div className="eyebrow">GAMUUR ANALYST</div><h1>Tell me what you need<br />to know from your data.</h1><p>Upload CSV or Excel and ask naturally. Gamuur decides what analysis, cleaning, visualization, forecasting, questions, and reporting are useful.</p><div className="examples"><button onClick={() => setInput("Analyze this file and tell me what I need to know.")}>Analyze this file</button><button onClick={() => setInput("Find the most important problems and trends.")}>Find problems & trends</button><button onClick={() => setInput("Create a management report with recommendations.")}>Create a report</button></div></div> : <div className="messages">{messages.map((message, index) => <article key={index}><strong>{message.role === "user" ? "You" : "G"}</strong><div><p>{message.text}</p>{message.result?.dataset && <div className="cards"><div className="result"><b>Dataset</b><span>{message.result.dataset.rows.toLocaleString()} rows · {message.result.dataset.columns} columns</span></div><div className="result"><b>Data quality</b><span>{message.result.dataset.quality_score}/100</span></div><div className="result"><b>Workflow</b><span>{message.result.stages.join(" → ")}</span></div></div>}{message.result?.findings?.questions && <div className="result"><b>Questions Gamuur recommends</b>{message.result.findings.questions.map((q: string) => <span key={q}>• {q}</span>)}</div>}{message.result?.findings?.forecasting?.status === "completed" && <div className="result"><b>Forecast</b><span>Baseline forecast generated for {message.result.findings.forecasting.target}.</span></div>}{message.result?.findings?.report && <div className="result"><b>Report ready to build</b><span>Executive summary · findings · trends · forecast · recommendations</span></div>}</div></article>)}</div>}
        </div>
        <div className="composerArea">
          {file && <div className="file">▧ {file.name}<button onClick={() => setFile(null)}>×</button></div>}
          <div className="composer"><button aria-label="Upload file" onClick={() => inputRef.current?.click()}>＋</button><input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={chooseFile}/><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} placeholder={t.placeholder || "Ask Gamuur anything about your data…"}/><button className="send" disabled={busy || !input.trim()} onClick={() => void send()}>{busy ? "…" : "↑"}</button></div>
          <small>{file ? "Your file will be profiled, checked, analyzed, and used to drive the response." : "No dataset? Ask Gamuur a normal question. Upload CSV/Excel when you want data analysis."}</small>
        </div>
      </section>
      {gate && <div className="overlay"><div className="gate"><button className="close" onClick={() => setGate(false)}>×</button><div className="logo">G</div><h2>{t.guestTitle}</h2><p>{t.guestText}</p><Link href="/auth?mode=login">{t.signIn}</Link></div></div>}
      <style jsx>{`:global(body){margin:0;background:#f7f8f5;color:#17201b;font-family:Inter,system-ui,sans-serif}.app{min-height:100vh;display:grid;grid-template-columns:205px 1fr}.sidebar{background:#eef2ed;border-right:1px solid #dce2db;padding:20px 13px;display:flex;flex-direction:column;gap:5px}.brand{font-weight:850;display:flex;align-items:center;gap:8px;margin:2px 7px 16px}.brand b,.logo{width:32px;height:32px;display:grid;place-items:center;background:#17201b;color:#fff;border-radius:9px}.newChat{border:1px solid #d8ded7;background:#fff;padding:8px 9px;text-align:left;border-radius:8px;font-size:10px;font-weight:750;color:#424d45;margin-bottom:12px}.sectionLabel{letter-spacing:.12em;font-size:8px;color:#929a93;padding:8px}.capabilities{display:grid;gap:4px;padding:4px 8px}.capabilities span{font-size:9px;color:#69736b;padding:5px 0}.spacer{flex:1}.status,.sidebar>a{font-size:9px;color:#778078;padding:7px 8px;text-decoration:none}.main{min-width:0;display:flex;flex-direction:column;min-height:100vh}header{height:58px;border-bottom:1px solid #dfe4de;padding:0 25px;display:flex;justify-content:space-between;align-items:center;color:#737c75;font-size:10px}header nav{display:flex;gap:15px;align-items:center}header a{color:#68726a;text-decoration:none;font-size:10px}select{appearance:none;border:0;background:transparent;color:#68726a;font-size:10px}.body{flex:1;overflow:auto}.welcome,.messages{width:min(820px,calc(100% - 40px));margin:auto}.welcome{padding-top:18vh}.eyebrow{font-size:9px;letter-spacing:.18em;color:#8b958d;margin-bottom:18px}.welcome h1{font-size:clamp(42px,6vw,70px);line-height:.98;letter-spacing:-.065em;margin:0;max-width:820px}.welcome p{max-width:620px;color:#707971;line-height:1.7;font-size:14px}.examples{display:flex;gap:7px;flex-wrap:wrap;margin-top:25px}.examples button{border:1px solid #d7ddd6;background:#fff;border-radius:9px;padding:9px 11px;font-size:10px;color:#59635b}.messages{padding:35px 0 230px}.messages article{display:flex;gap:12px;margin:22px 0}.messages article>strong{width:30px;height:30px;background:#e7ece6;border-radius:9px;display:grid;place-items:center;font-size:9px;flex:none}.messages p{line-height:1.7;white-space:pre-wrap}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.result{background:#fff;border:1px solid #dce2db;border-radius:10px;padding:10px;margin-top:8px;display:grid;gap:5px;font-size:10px}.result span{color:#707971}.composerArea{position:sticky;bottom:0;background:linear-gradient(transparent,#f7f8f5 16%);padding:10px 22px 18px}.file{width:min(800px,calc(100% - 20px));margin:6px auto;background:#fff;border:1px solid #dce2db;border-radius:9px;padding:8px;font-size:10px}.file button{float:right;border:0;background:none}.composer{width:min(800px,calc(100% - 20px));margin:auto;background:#fff;border:1px solid #cfd7ce;border-radius:15px;padding:7px;display:flex;align-items:end}.composer>button{width:38px;height:38px;border:0;background:transparent;font-size:20px}.composer textarea{flex:1;border:0;outline:0;resize:none;padding:10px;font:inherit;font-size:13px}.composer .send{background:#17201b;color:#fff;border-radius:10px}.composer .send:disabled{background:#dfe3de;color:#9aa29b}.composerArea>small{display:block;text-align:center;color:#929a93;font-size:8px;margin-top:6px}.overlay{position:fixed;inset:0;background:#0005;display:grid;place-items:center;z-index:20}.gate{width:min(400px,calc(100% - 40px));background:#fff;border-radius:18px;padding:30px}.gate .close{float:right;border:0;background:none;font-size:20px}.gate h2{font-size:32px;letter-spacing:-.05em}.gate p{color:#6c756e;line-height:1.6}.gate a{display:inline-block;background:#17201b;color:#fff;padding:11px 14px;border-radius:9px;text-decoration:none;font-size:11px}.gate .logo{margin-top:10px}@media(max-width:700px){.app{display:block}.sidebar{display:none}.welcome,.messages{width:calc(100% - 28px)}.composerArea{padding:8px 12px 14px}header{padding:0 14px}.welcome{padding-top:12vh}.cards{grid-template-columns:1fr}}`}</style>
    </main>
  );
}
