"use client";

import { ChangeEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase-browser";
import { createProject, getBackendHealth, getProjects, uploadDataset } from "../lib/api";

type ConnectionState = "checking" | "connected" | "disconnected";
type Message = { role: "user" | "assistant"; text: string; fileName?: string };

export default function Home() {
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBackendHealth().then(() => setConnection("connected")).catch(() => setConnection("disconnected"));
  }, []);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    const ext = selected.name.toLowerCase().split(".").pop();
    if (ext !== "csv" && ext !== "xlsx" && ext !== "xls") {
      setMessages((current) => [...current, { role: "assistant", text: "Please upload a CSV or Excel file." }]);
      return;
    }
    setFile(selected);
  };

  const send = async () => {
    const prompt = input.trim();
    if ((!prompt && !file) || sending) return;
    setSending(true);
    const attachedFile = file;
    setMessages((current) => [...current, { role: "user", text: prompt || "Analyze this dataset.", fileName: attachedFile?.name }]);
    setInput("");
    setFile(null);

    try {
      if (attachedFile) {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setMessages((current) => [...current, { role: "assistant", text: "Please sign in before uploading a dataset." }]);
          return;
        }
        let projects = await getProjects(session.access_token);
        let project = projects[0];
        if (!project) project = await createProject(session.access_token, "My Gamuur Workspace");
        await uploadDataset(session.access_token, project.id, attachedFile.name, attachedFile);
        setMessages((current) => [...current, {
          role: "assistant",
          text: prompt
            ? `I received ${attachedFile.name}. The dataset has been uploaded and profiled. Your request is: “${prompt}”` 
            : `I received ${attachedFile.name}. The dataset has been uploaded and profiled. Tell me what you want to discover from it.`,
        }]);
      } else {
        setMessages((current) => [...current, { role: "assistant", text: "I’m ready. Upload a dataset when you want Gamuur to analyze real economic data." }]);
      }
    } catch {
      setMessages((current) => [...current, { role: "assistant", text: "I couldn't process that request right now. Please try again." }]);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand"><span className="brandMark">G</span><span>Gamuur</span></div>
        <button className="newChat" onClick={() => setMessages([])}>＋ New chat</button>
        <div className="sideLabel">RECENT</div>
        <div className="emptyRecent">Your conversations will appear here.</div>
        <div className="sideBottom">
          <a href="/workspace">Dataset workspace</a>
          <a href="#capabilities">Capabilities</a>
          <div className="connection"><span className={`dot ${connection === "connected" ? "live" : ""}`} />{connection === "connected" ? "System online" : connection === "checking" ? "Checking system" : "System unavailable"}</div>
        </div>
      </aside>

      <section className="mainPanel">
        <header className="topbar"><div className="mobileBrand"><span className="brandMark">G</span> Gamuur</div><span className="modelPill">Economic Intelligence</span></header>

        <div className="conversation">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcomeMark">G</div>
              <div className="eyebrow">ECONOMIC INTELLIGENCE</div>
              <h1>What are we<br /><span>analyzing today?</span></h1>
              <p>Drop in an Excel or CSV file, tell Gamuur what you want, and let the intelligence workflow handle the data work for you.</p>
              <div className="suggestions">
                <button onClick={() => setInput("Find the main trends in this data")}>Find the main trends <span>↗</span></button>
                <button onClick={() => setInput("Show me the most important changes")}>Show important changes <span>↗</span></button>
                <button onClick={() => setInput("Create useful visualizations")}>Create visualizations <span>↗</span></button>
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((message, index) => (
                <div className={`messageRow ${message.role}`} key={`${message.role}-${index}`}>
                  <div className="avatar">{message.role === "user" ? "You" : "G"}</div>
                  <div className="messageBody">
                    {message.fileName && <div className="fileChip">▧ {message.fileName}</div>}
                    <p>{message.text}</p>
                  </div>
                </div>
              ))}
              {sending && <div className="messageRow assistant"><div className="avatar">G</div><div className="typing"><span /><span /><span /></div></div>}
            </div>
          )}
        </div>

        <div className="composerArea">
          {file && <div className="attachment"><span>▧</span><div><strong>{file.name}</strong><small>{Math.round(file.size / 1024)} KB</small></div><button onClick={() => setFile(null)}>×</button></div>}
          <div className="composer">
            <button className="attach" aria-label="Attach dataset" onClick={() => fileRef.current?.click()}>＋</button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={chooseFile} hidden />
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Ask Gamuur anything..." rows={1} />
            <button className="send" onClick={() => void send()} disabled={sending || (!input.trim() && !file)} aria-label="Send">↑</button>
          </div>
          <div className="composerHint">Upload CSV or Excel · Ask in plain language · Shift + Enter for a new line</div>
        </div>
      </section>

      <section id="capabilities" className="capabilities">
        <div className="capHeader"><span>GAMUUR ENGINE</span><small>Automatic workflow</small></div>
        {["Datasets", "Cleaning", "Analysis", "Forecasting", "AI Insights", "Reports"].map((item, index) => (
          <div className="capability" key={item}><span className="capNumber">0{index + 1}</span><div><strong>{item}</strong><p>{["Upload, version and profile your data.", "Find quality issues before analysis.", "Explore trends, relationships and statistics.", "Build forecasts from validated data.", "Ask questions and get explainable intelligence.", "Turn approved findings into reports."][index]}</p></div><span className="capArrow">→</span></div>
        ))}
      </section>

      <style jsx>{`:global(*){box-sizing:border-box}:global(body){margin:0;background:#f7f8f5;color:#17201b;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.appShell{min-height:100vh;display:grid;grid-template-columns:220px minmax(0,1fr) 285px}.sidebar{border-right:1px solid #e1e5df;background:#f3f5f1;padding:22px 16px;display:flex;flex-direction:column}.brand,.mobileBrand{display:flex;align-items:center;gap:9px;font-weight:780;letter-spacing:-.04em}.brandMark{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#17201b;color:#fff;font-size:15px}.newChat{margin-top:27px;border:1px solid #d8ddd6;background:#fff;border-radius:9px;padding:11px 12px;text-align:left;font-weight:700;color:#29342d;cursor:pointer}.sideLabel,.capHeader{font-size:9px;letter-spacing:.15em;font-weight:800;color:#929a93}.sideLabel{margin:28px 8px 10px}.emptyRecent{font-size:11px;color:#8a938c;line-height:1.5;padding:0 8px}.sideBottom{margin-top:auto;display:flex;flex-direction:column;gap:12px;font-size:11px}.sideBottom a{color:#5f6961;text-decoration:none}.connection{display:flex;align-items:center;gap:7px;color:#788078;margin-top:8px}.dot{width:7px;height:7px;border-radius:50%;background:#9da59e}.dot.live{background:#2f8b58}.mainPanel{min-width:0;display:flex;flex-direction:column;min-height:100vh}.topbar{height:66px;border-bottom:1px solid #e1e5df;display:flex;align-items:center;justify-content:flex-end;padding:0 30px}.mobileBrand{display:none}.modelPill{font-size:10px;color:#687169;border:1px solid #dce1db;background:#fff;border-radius:999px;padding:7px 10px}.conversation{flex:1;display:flex;justify-content:center;overflow:auto}.welcome{width:min(760px,calc(100% - 44px));margin:auto;padding:65px 0}.welcomeMark{width:44px;height:44px;display:grid;place-items:center;border-radius:13px;background:#17201b;color:#fff;font-weight:800;font-size:20px;margin-bottom:25px}.eyebrow{font-size:10px;letter-spacing:.16em;font-weight:800;color:#8a928b;margin-bottom:14px}.welcome h1{font-size:clamp(45px,6vw,76px);line-height:.94;letter-spacing:-.07em;margin:0}.welcome h1 span{color:#79827b}.welcome p{font-size:16px;line-height:1.65;color:#707971;max-width:620px;margin:25px 0}.suggestions{display:flex;flex-wrap:wrap;gap:8px}.suggestions button{border:1px solid #dce1db;background:#fff;border-radius:999px;padding:9px 12px;color:#505a52;font-size:11px;cursor:pointer}.suggestions button span{margin-left:9px}.messages{width:min(760px,calc(100% - 44px));padding:42px 0 150px}.messageRow{display:flex;gap:13px;margin:24px 0}.avatar{flex:0 0 30px;height:30px;border-radius:9px;display:grid;place-items:center;font-size:9px;font-weight:800;background:#e8ece6;color:#475149}.assistant .avatar{background:#17201b;color:#fff}.messageBody{max-width:680px}.messageBody p{margin:3px 0;font-size:14px;line-height:1.7;color:#303a32}.fileChip{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #dfe4de;border-radius:8px;padding:7px 9px;font-size:11px;margin-bottom:8px}.typing{display:flex;gap:4px;padding:10px 0}.typing span{width:5px;height:5px;background:#89928a;border-radius:50%;animation:pulse 1s infinite}.typing span:nth-child(2){animation-delay:.15s}.typing span:nth-child(3){animation-delay:.3s}@keyframes pulse{50%{opacity:.25}}.composerArea{position:sticky;bottom:0;padding:15px 30px 22px;background:linear-gradient(transparent,#f7f8f5 20%)}.composer{max-width:760px;margin:auto;min-height:56px;border:1px solid #cfd6ce;background:#fff;border-radius:15px;display:flex;align-items:flex-end;padding:8px;box-shadow:0 8px 28px #17201b0a}.attach,.send{width:38px;height:38px;border:0;border-radius:10px;cursor:pointer;flex:0 0 auto}.attach{background:transparent;font-size:22px;color:#6e786f}.send{background:#17201b;color:#fff;font-size:19px}.send:disabled{background:#dfe3de;color:#9ba39c;cursor:not-allowed}.composer textarea{border:0;outline:0;resize:none;flex:1;padding:10px 8px;font:inherit;font-size:13px;line-height:20px;background:transparent;max-height:120px}.composerHint{text-align:center;font-size:9px;color:#9aa19b;margin-top:8px}.attachment{max-width:760px;margin:0 auto 8px;border:1px solid #dce1db;background:#fff;border-radius:10px;padding:9px 11px;display:flex;align-items:center;gap:10px;font-size:11px}.attachment>span{font-size:17px}.attachment div{display:flex;flex-direction:column;flex:1}.attachment small{color:#8b938c;margin-top:2px}.attachment button{border:0;background:transparent;font-size:19px;color:#7b847d;cursor:pointer}.capabilities{border-left:1px solid #e1e5df;background:#f3f5f1;padding:24px 18px}.capHeader{display:flex;justify-content:space-between;margin-bottom:14px}.capHeader small{font-size:9px;letter-spacing:0;color:#9aa19b;font-weight:500}.capability{display:grid;grid-template-columns:25px 1fr 14px;gap:8px;padding:17px 0;border-top:1px solid #e0e4df;align-items:start}.capNumber{font-size:9px;color:#9aa19b}.capability strong{font-size:12px}.capability p{font-size:10px;line-height:1.5;color:#7a837c;margin:5px 0 0}.capArrow{font-size:12px;color:#8b938c}@media(max-width:1000px){.appShell{grid-template-columns:190px minmax(0,1fr)}.capabilities{display:none}}@media(max-width:680px){.appShell{display:block}.sidebar{display:none}.topbar{height:58px;padding:0 17px;justify-content:space-between}.mobileBrand{display:flex}.welcome{padding:48px 0}.welcome h1{font-size:50px}.composerArea{padding:12px 14px 17px}.messages{width:calc(100% - 30px)}.welcome{width:calc(100% - 30px)}.composerHint{font-size:8px}.modelPill{font-size:9px}}`}</style>
    </main>
  );
}
