"use client";

import Link from "next/link";
import { ChangeEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase-browser";
import { createProject, getBackendHealth, getProjects, runIntelligence, sendChat, uploadDataset } from "../lib/api";
import { useLanguage } from "./components/language-provider";

type Stage = "cleaning" | "analysis" | "forecasting" | "insights" | "visualization" | "report";
type Message = { role: "user" | "assistant"; text: string; result?: any };

type ChatHistory = { id: string; title: string };

export default function Home() {
  const { language, setLanguage, t } = useLanguage();
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<ChatHistory[]>([]);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [gate, setGate] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Stage[]>(["cleaning", "analysis", "insights", "visualization"]);
  const inputRef = useRef<HTMLInputElement>(null);

  const stages: Array<{ id: Stage; name: string }> = [
    { id: "cleaning", name: t.clean }, { id: "analysis", name: t.analysis },
    { id: "forecasting", name: t.forecast }, { id: "insights", name: t.insights },
    { id: "visualization", name: t.visualization }, { id: "report", name: t.report },
  ];

  useEffect(() => {
    getBackendHealth().then(() => setOnline(true)).catch(() => setOnline(false));
    try { setHistory(JSON.parse(localStorage.getItem("gamuur-history") || "[]")); } catch { setHistory([]); }
    if (new URLSearchParams(window.location.search).get("signedUp") === "1") {
      setNotice(t.signedUp);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [t.signedUp]);

  const toggleStage = (id: Stage) => setSelected((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);

  const startNewChat = () => { setMessages([]); setInput(""); setFile(null); setNotice(""); };

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
      if (!file) {
        const response = await sendChat(session.access_token, prompt, language);
        setMessages((m) => [...m, { role: "assistant", text: response.answer }]);
      } else {
        const projects = await getProjects(session.access_token);
        const project = projects[0] ?? await createProject(session.access_token, "My Gamuur Workspace");
        const dataset = await uploadDataset(session.access_token, project.id, file.name, file);
        const result = await runIntelligence(session.access_token, project.id, dataset.id, prompt, selected);
        setMessages((m) => [...m, { role: "assistant", text: result.insights ?? "Gamuur completed the selected stages.", result }]);
        setFile(null);
      }
      const title = prompt.length > 42 ? `${prompt.slice(0, 42)}…` : prompt;
      const next = [{ id: crypto.randomUUID(), title }, ...history].slice(0, 12);
      setHistory(next);
      localStorage.setItem("gamuur-history", JSON.stringify(next));
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
        <button className="newChat" onClick={startNewChat}>＋ {t.newChat}</button>
        <div className="sectionLabel">{t.history}</div>
        <div className="historyList">
          {history.length ? history.map((chat) => <button key={chat.id} onClick={startNewChat} title={chat.title}>{chat.title}</button>) : <span className="emptyHistory">{language === "so" ? "Wadahadalladaadu halkan ayay ka muuqan doonaan." : language === "ar" ? "ستظهر محادثاتك هنا." : "Your conversations will appear here."}</span>}
        </div>
        <div className="pluginsBlock">
          <div className="sectionLabel">{t.plugins}</div>
          <div className="pluginPlaceholder"><span>✦</span>{t.comingSoon}</div>
        </div>
        <div className="spacer" />
        <span className="status">● {online ? "System online" : "Checking system"}</span>
        <Link href="/settings">⚙ {t.settings}</Link>
        <Link href="/profile">◯ {t.profile}</Link>
      </aside>

      <section className="main">
        <header><span>Economic Intelligence</span><nav><Link href="/about">{t.about}</Link><Link href="/auth?mode=login">{t.signIn}</Link><Link href="/auth?mode=signup">{t.signUp}</Link><select aria-label="Language" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}><option value="en">EN</option><option value="so">SO</option><option value="ar">ع</option></select></nav></header>
        <div className="body">
          {notice && <div className="notice">{notice}</div>}
          {!messages.length ? <div className="welcome"><h1>{t.heroTitle}</h1></div> : <div className="messages">{messages.map((message, index) => <article key={index}><strong>{message.role === "user" ? "You" : "G"}</strong><div><p>{message.text}</p>{message.result?.analysis && <div className="result"><b>{t.analysis}</b><span>{message.result.analysis.rows} rows · {message.result.analysis.columns} columns</span></div>}{message.result?.cleaning && <div className="result"><b>{t.clean}</b><span>{message.result.cleaning.changes.join(" · ") || "No changes needed."}</span></div>}{message.result?.visualization && <div className="result"><b>{t.visualization}</b><span>{message.result.visualization.charts.length} chart specification(s)</span></div>}</div></article>)}</div>}
        </div>
        <div className="composerArea">
          <div className="stages">{stages.map((stage) => <button key={stage.id} className={selected.includes(stage.id) ? "selected" : ""} onClick={() => toggleStage(stage.id)}>{selected.includes(stage.id) ? "✓" : "○"} {stage.name}</button>)}</div>
          {file && <div className="file">▧ {file.name}<button onClick={() => setFile(null)}>×</button></div>}
          <div className="composer"><button aria-label="Upload file" onClick={() => inputRef.current?.click()}>＋</button><input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={chooseFile}/><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} placeholder={t.placeholder}/><button className="send" disabled={busy || !input.trim()} onClick={() => void send()}>{busy ? "…" : "↑"}</button></div>
          <small>No dataset? Ask Gamuur first. Upload CSV/Excel when you want analysis.</small>
        </div>
      </section>

      {gate && <div className="overlay"><div className="gate"><button className="close" onClick={() => setGate(false)}>×</button><div className="logo">G</div><h2>{t.guestTitle}</h2><p>{t.guestText}</p><div><Link href="/auth?mode=login">{t.signIn}</Link><Link href="/auth?mode=signup">{t.signUp}</Link></div><button onClick={() => setGate(false)}>{t.continueGuest}</button></div></div>}

      <style jsx>{`
        :global(body){margin:0;background:#f7f8f5;color:#17201b;font-family:Inter,system-ui,sans-serif}.app{min-height:100vh;display:grid;grid-template-columns:205px 1fr}.sidebar{background:#eef2ed;border-right:1px solid #dce2db;padding:20px 13px;display:flex;flex-direction:column;gap:5px}.brand{font-weight:850;display:flex;align-items:center;gap:8px;margin:2px 7px 16px}.brand b,.logo{width:32px;height:32px;display:grid;place-items:center;background:#17201b;color:#fff;border-radius:9px}.newChat{border:1px solid #d8ded7;background:#fff;padding:7px 9px;text-align:left;border-radius:8px;font-size:10px;font-weight:750;color:#424d45;margin-bottom:12px}.sectionLabel{text-transform:uppercase;letter-spacing:.12em;font-size:8px;color:#929a93;padding:8px 8px 5px}.historyList{display:grid;gap:2px;max-height:230px;overflow:auto}.historyList button{border:0;background:transparent;padding:7px 8px;text-align:left;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;border-radius:7px;color:#606a62;font-size:10px}.historyList button:hover{background:#e4e9e3}.emptyHistory{padding:6px 8px;color:#9aa19b;font-size:9px;line-height:1.5}.pluginsBlock{margin-top:10px}.pluginPlaceholder{margin:2px 5px;padding:9px;border:1px dashed #cfd7ce;border-radius:8px;color:#909890;font-size:9px;display:flex;gap:7px;align-items:center}.pluginPlaceholder span{font-size:11px}.spacer{flex:1}.status{font-size:9px;color:#778078;padding:4px 8px}.sidebar>a{border:0;background:transparent;padding:8px;text-align:left;text-decoration:none;color:#59635b;border-radius:8px;font-size:10px}.sidebar>a:hover{background:#e4e9e3}.main{min-width:0;display:flex;flex-direction:column;min-height:100vh}header{height:58px;border-bottom:1px solid #dfe4de;padding:0 25px;display:flex;justify-content:space-between;align-items:center;color:#737c75;font-size:10px}header nav{display:flex;gap:15px;align-items:center}header a{color:#68726a;text-decoration:none;font-size:10px}header a:hover{color:#17201b}select{appearance:none;border:0;background:transparent;color:#68726a;font-size:10px;padding:3px 0;outline:0}.body{flex:1;overflow:auto}.welcome,.messages{width:min(820px,calc(100% - 40px));margin:auto}.welcome{padding-top:19vh}.welcome h1{font-size:clamp(46px,6.5vw,74px);line-height:.96;letter-spacing:-.065em;margin:0;max-width:820px;white-space:pre-line}.messages{padding:35px 0 230px}.messages article{display:flex;gap:12px;margin:22px 0}.messages article>strong{width:30px;height:30px;background:#e7ece6;border-radius:9px;display:grid;place-items:center;font-size:9px;flex:none}.messages p{line-height:1.7}.result{background:#fff;border:1px solid #dce2db;border-radius:10px;padding:10px;margin-top:8px;display:grid;gap:5px;font-size:10px}.result span{color:#707971}.composerArea{position:sticky;bottom:0;background:linear-gradient(transparent,#f7f8f5 16%);padding:10px 22px 18px}.stages{width:min(820px,100%);margin:auto;display:flex;flex-wrap:wrap;gap:5px}.stages button{border:1px solid #d7ddd6;background:#fff;border-radius:8px;padding:7px 9px;font-size:9px;color:#657067}.stages .selected{background:#e9eee8;border-color:#aeb9af}.file{width:min(800px,calc(100% - 20px));margin:6px auto;background:#fff;border:1px solid #dce2db;border-radius:9px;padding:8px;font-size:10px}.file button{float:right;border:0;background:none}.composer{width:min(800px,calc(100% - 20px));margin:auto;background:#fff;border:1px solid #cfd7ce;border-radius:15px;padding:7px;display:flex;align-items:end}.composer>button{width:38px;height:38px;border:0;background:transparent;font-size:20px}.composer textarea{flex:1;border:0;outline:0;resize:none;padding:10px;font:inherit;font-size:13px}.composer .send{background:#17201b;color:#fff;border-radius:10px}.composer .send:disabled{background:#dfe3de;color:#9aa29b}.composerArea>small{display:block;text-align:center;color:#929a93;font-size:8px;margin-top:6px}.notice{width:min(820px,calc(100% - 40px));margin:12px auto;background:#e9f0e8;border:1px solid #ccd9cb;border-radius:9px;padding:10px;font-size:11px}.overlay{position:fixed;inset:0;background:#0005;display:grid;place-items:center;z-index:20}.gate{width:min(400px,calc(100% - 40px));background:#fff;border-radius:18px;padding:30px}.gate .close{float:right;border:0;background:none;font-size:20px}.gate h2{font-size:32px;letter-spacing:-.05em}.gate p{color:#6c756e;line-height:1.6}.gate a{display:inline-block;background:#17201b;color:#fff;padding:11px 14px;border-radius:9px;text-decoration:none;font-size:11px;margin-right:7px}.gate a+a{background:#e9eee8;color:#17201b}.gate>button:last-child{border:0;background:transparent;color:#737c75;padding:12px}.gate .logo{margin-top:10px}@media(max-width:700px){.app{display:block}.sidebar{display:none}.welcome,.messages{width:calc(100% - 28px)}.composerArea{padding:8px 12px 14px}header{padding:0 14px}.welcome{padding-top:12vh}header span{display:none}}
      `}</style>
    </main>
  );
}
