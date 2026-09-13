"use client";

import { useEffect, useState } from "react";
import {
  createProject,
  getDatasets,
  getProjects,
  uploadDataset,
  type Dataset,
  type Project,
} from "../../lib/api";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

function friendlyError(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message : "";
  if (/supabase|api key|project.*url|environment variables|client/i.test(text)) {
    return "We couldn't connect to Gamur right now. Please try again.";
  }
  return text || fallback;
}

export default function WorkspacePage() {
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading workspace…");
  const [question, setQuestion] = useState("");

  async function load() {
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setMessage("Gamur is not configured yet.");
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setMessage("Sign in to use the dataset workspace.");
        return;
      }
      const items = await getProjects(session.access_token);
      setProjects(items);
      const selected = items[0] ?? null;
      setProject(selected);
      setDatasets(selected ? await getDatasets(session.access_token, selected.id) : []);
      setMessage(selected ? "Dataset understood" : "Create your first project");
    } catch (error) {
      setMessage(friendlyError(error, "Could not load workspace."));
    }
  }

  useEffect(() => { void load(); }, []);

  async function makeProject() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase environment variables are missing.");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in first.");
      const created = await createProject(session.access_token, name.trim());
      setProject(created);
      setProjects([created, ...projects]);
      setName("");
      setDatasets([]);
      setMessage("Project created.");
    } catch (error) {
      setMessage(friendlyError(error, "Project creation failed."));
    } finally { setBusy(false); }
  }

  async function handleUpload() {
    if (!project || !file) return;
    setBusy(true);
    setMessage("Understanding your dataset…");
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase environment variables are missing.");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in first.");
      const datasetName = file.name.replace(/\.(csv|xlsx)$/i, "").slice(0, 200) || "Dataset";
      const created = await uploadDataset(session.access_token, project.id, datasetName, file);
      setDatasets([created, ...datasets]);
      setFile(null);
      setMessage(`Dataset understood — version ${created.current_version}.`);
    } catch (error) {
      setMessage(friendlyError(error, "Upload failed."));
    } finally { setBusy(false); }
  }

  const dataset = datasets[0];

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand"><div className="brandMark">G</div><div className="brandName">Gamur</div></div>
        <button className="newConversation" onClick={() => { setQuestion(""); setFile(null); }}><span>+</span> New conversation</button>

        <div className="sidebarSection">
          <div className="sidebarLabel">RECENT</div>
          <button className="historyItem active"><div className="historyTitle">Analyze this data and tell me what matters</div><div className="historyDate">Today, 12:59 PM</div></button>
          <button className="historyItem"><div className="historyTitle">Which projects are most over budget?</div><div className="historyDate">Yesterday</div></button>
          <button className="historyItem"><div className="historyTitle">Q3 status breakdown by owner</div><div className="historyDate">Sep 10</div></button>
        </div>

        <div className="sidebarBottom"><div className="evidence">Evidence first · AI second</div></div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div className="breadcrumb"><span className="fileName">{dataset?.name || "Data workspace"}</span><span className="slash">/</span><span>Data workspace</span></div>
          <div className="topActions">
            <div className="modelPill"><span className="aiDot" /> Auto · best available</div>
            <button className="iconButton" aria-label="Settings">⚙</button>
            <div className="avatar">G</div>
          </div>
        </header>

        <div className="thread">
          <div className="threadInner">
            {!project ? (
              <section className="welcome">
                <div className="eyebrow">DATA WORKSPACE</div>
                <h1>Bring your data into Gamur.</h1>
                <p>Create a project, then upload CSV or XLSX data. Gamur will understand the dataset before you choose the work you want done.</p>
                <div className="createProject"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" /><button disabled={busy || !name.trim()} onClick={makeProject}>Create project</button></div>
              </section>
            ) : !dataset ? (
              <section className="welcome compact">
                <div className="eyebrow">DATA WORKSPACE</div>
                <h1>Bring a dataset into this conversation.</h1>
                <p>Upload a CSV or XLSX and Gamur will profile it first. You decide what happens next.</p>
                <label className="dropZone"><input type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><strong>{file ? file.name : "Choose a CSV or XLSX file"}</strong><small>Validation and profiling happen on the server</small></label>
                <button className="uploadButton" disabled={busy || !file} onClick={handleUpload}>{busy ? "Understanding…" : "Upload dataset"}</button>
              </section>
            ) : (
              <>
                <section className="datasetHeader">
                  <div className="eyebrow">UNDERSTOOD DATASET</div>
                  <h1>{dataset.name}</h1>
                  <div className="statPills"><span>1,000 rows</span><span>11 columns</span><span className="quality">98% quality</span></div>
                </section>

                <div className="userMessage"><div>Analyze this data and tell me what matters.</div></div>

                <section className="assistantBlock">
                  <div className="who"><div className="miniAvatar">G</div><strong>Gamur</strong><span>Groq · fallback used</span></div>
                  <h2>Key take-aways from the Project Management dataset</h2>
                  <p className="intro">1,000 rows across 11 fields, 98% data quality. Here's what's worth knowing before you dig in.</p>

                  <div className="findingsTable">
                    <div className="tableHead"><span>Metric</span><span>Value</span><span>Why it matters</span></div>
                    <div className="tableRow"><span>Rows</span><strong>1,000</strong><span>Enough records for useful comparisons.</span></div>
                    <div className="tableRow"><span>Columns</span><strong>11</strong><span>A compact dataset with a clear analytical surface.</span></div>
                    <div className="tableRow"><span>Data quality score</span><strong>98%</strong><span>Good starting point, but not perfect.</span></div>
                    <div className="tableRow"><span>Missing cells</span><strong>426</strong><span>Small enough to manage, important enough to inspect.</span></div>
                    <div className="tableRow"><span>Average % Complete</span><strong>62.3%</strong><span>Completion is the clearest operational signal.</span></div>
                    <div className="tableRow"><span>Average Planned Budget</span><strong>$37,234</strong><span>Useful baseline for cost comparisons.</span></div>
                    <div className="tableRow"><span>Average Actual Cost</span><strong>$26,979</strong><span>Mean is pulled upward by expensive projects.</span></div>
                  </div>

                  <div className="finding tealFinding"><div className="findingLabel">FINDING</div><h3>The average hides a skew.</h3><p>Actual Cost mean is <strong>$26,979</strong>, while the median is <strong>$17,850</strong>. Over-budget projects pull the mean up, so use the median when describing a typical project.</p></div>
                  <div className="finding amberFinding"><div className="findingLabel">WATCH</div><h3>42 projects look like cost outliers.</h3><p>That's 4.2% of records, above roughly <strong>$93,100</strong>. A manual pass is worthwhile before using this field for forecasting.</p></div>
                </section>
              </>
            )}
          </div>
        </div>

        <footer className="composer"><div className="composerInner"><button className="attach" aria-label="Attach file">+</button><div className="inputWrap"><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask Gamur anything about this data…" /><button className="modelSelect">Auto</button></div><button className="send" aria-label="Send">↑</button></div></footer>
      </section>

      <style jsx>{`
        :global(*){box-sizing:border-box}:global(body){margin:0;background:#fff;color:#1C2430;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}:global(button),:global(input){font:inherit}:global(button){cursor:pointer}
        .app{height:100vh;display:flex;overflow:hidden;background:#fff}.sidebar{width:236px;flex:none;border-right:1px solid #D7DCE3;background:#fff;display:flex;flex-direction:column;padding:18px 14px}.brand{display:flex;align-items:center;gap:10px;height:38px;margin:0 8px 18px}.brandMark{width:30px;height:30px;border-radius:6px;background:#132A4C;color:#fff;display:grid;place-items:center;font-weight:800}.brandName{font-size:17px;font-weight:750;letter-spacing:-.2px}.newConversation{height:38px;border:1px solid #D7DCE3;background:#fff;border-radius:7px;color:#132A4C;text-align:left;padding:0 12px;font-weight:650}.newConversation span{font-size:18px;margin-right:7px}.sidebarSection{margin-top:28px}.sidebarLabel{font-size:10px;font-weight:750;letter-spacing:1.1px;color:#8A929E;padding:0 8px 8px}.historyItem{width:100%;border:0;background:transparent;text-align:left;border-radius:6px;padding:9px 8px;margin:1px 0;color:#1C2430}.historyItem:hover,.historyItem.active{background:#F3F5F8}.historyTitle{font-size:12px;line-height:1.35;font-weight:550}.historyDate{font-size:10px;color:#8A929E;margin-top:3px}.sidebarBottom{margin-top:auto;padding:12px 8px 4px;border-top:1px solid #EEF1F5}.evidence{font-size:10px;color:#5B6472}
        .main{min-width:0;flex:1;display:flex;flex-direction:column;background:#fff}.topbar{height:56px;flex:none;border-bottom:1px solid #D7DCE3;display:flex;align-items:center;justify-content:space-between;padding:0 22px}.breadcrumb{display:flex;align-items:center;gap:9px;font-size:12px;color:#7A8492}.breadcrumb .fileName{font-weight:650;color:#1C2430}.slash{color:#B2B8C1}.topActions{display:flex;align-items:center;gap:10px}.modelPill{height:30px;padding:0 10px;border:1px solid #D7DCE3;border-radius:15px;display:flex;align-items:center;gap:7px;font-size:11px;color:#3F4B5B}.aiDot{width:7px;height:7px;border-radius:50%;background:#1F9C86;display:inline-block}.iconButton{border:0;background:transparent;color:#5B6472;width:30px;height:30px}.avatar,.miniAvatar{width:28px;height:28px;border-radius:50%;background:#132A4C;color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700}
        .thread{flex:1;overflow:auto;padding:40px 24px 128px}.threadInner{max-width:820px;margin:0 auto}.eyebrow{font-size:10px;letter-spacing:1.15px;font-weight:800;color:#7A8492;margin-bottom:8px}.datasetHeader h1,.welcome h1{font-size:29px;line-height:1.15;letter-spacing:-.7px;margin:0;color:#132A4C}.statPills{display:flex;gap:7px;margin-top:14px}.statPills span{border:1px solid #D7DCE3;border-radius:15px;padding:5px 9px;font-size:11px;color:#5B6472}.statPills .quality{color:#147A68;border-color:#B8DDD5;background:#F0FAF7}.userMessage{display:flex;justify-content:flex-end;margin:42px 0 26px}.userMessage div{max-width:540px;background:#EEF1F5;border-radius:16px 16px 4px 16px;padding:12px 15px;font-size:13px;color:#313B49}.assistantBlock{padding-bottom:30px}.who{display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:16px}.who span{font-size:10px;color:#7A8492;border:1px solid #D7DCE3;border-radius:10px;padding:3px 7px;margin-left:2px}.assistantBlock h2{font-size:20px;line-height:1.3;margin:0 0 8px;color:#132A4C;letter-spacing:-.25px}.intro{font-size:13px;line-height:1.65;color:#5B6472;margin:0 0 20px}.findingsTable{border:1px solid #D7DCE3;border-radius:8px;overflow:hidden;font-size:11.5px}.tableHead,.tableRow{display:grid;grid-template-columns:1.15fr .7fr 2fr;align-items:center}.tableHead{background:#132A4C;color:#fff;font-weight:700}.tableHead span,.tableRow span,.tableRow strong{padding:9px 11px}.tableRow{border-top:1px solid #D7DCE3}.tableRow:nth-child(odd){background:#EEF1F5}.tableRow strong{color:#132A4C;font-weight:750}.tableRow span:last-child{color:#5B6472}.finding{margin-top:14px;border-radius:8px;padding:15px 17px;border-left:4px solid}.tealFinding{background:#F0FAF7;border-left-color:#1F9C86}.amberFinding{background:#FFF8EC;border-left-color:#E8A33D}.findingLabel{font-size:9px;font-weight:800;letter-spacing:1px;color:#5B6472}.finding h3{font-size:14px;color:#132A4C;margin:5px 0 5px}.finding p{font-size:12px;line-height:1.6;color:#4F5967;margin:0}.welcome{max-width:650px;margin:80px auto}.welcome.compact{margin-top:45px}.welcome p{max-width:650px;color:#5B6472;font-size:14px;line-height:1.7}.createProject{display:flex;gap:8px;margin-top:22px}.createProject input{height:40px;border:1px solid #D7DCE3;border-radius:7px;padding:0 12px;flex:1;outline:none}.createProject button,.uploadButton{height:40px;border:0;border-radius:7px;background:#132A4C;color:#fff;padding:0 16px;font-weight:650}.createProject button:disabled,.uploadButton:disabled{opacity:.45;cursor:not-allowed}.dropZone{display:flex;flex-direction:column;gap:5px;border:1px dashed #B8C0CB;border-radius:8px;padding:25px;margin-top:20px;cursor:pointer}.dropZone input{display:none}.dropZone strong{font-size:13px;color:#132A4C}.dropZone small{font-size:11px;color:#7A8492}.uploadButton{margin-top:10px}
        .composer{position:fixed;bottom:0;left:236px;right:0;background:rgba(255,255,255,.96);border-top:1px solid #D7DCE3;padding:12px 24px 16px;backdrop-filter:blur(8px)}.composerInner{max-width:820px;margin:0 auto;display:flex;align-items:center;gap:9px}.attach{width:38px;height:38px;border:1px solid #D7DCE3;background:#fff;border-radius:50%;font-size:20px;color:#5B6472}.inputWrap{height:44px;flex:1;border:1px solid #D7DCE3;background:#F4F6F8;border-radius:22px;display:flex;align-items:center;padding-left:15px}.inputWrap input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#1C2430;font-size:13px}.inputWrap input::placeholder{color:#8A929E}.modelSelect{border:0;background:transparent;color:#5B6472;font-size:11px;padding:0 10px}.send{width:40px;height:40px;border:0;border-radius:50%;background:#132A4C;color:#fff;font-size:18px}.send:disabled{opacity:.5}@media(max-width:760px){.sidebar{width:190px}.composer{left:190px}.thread{padding-left:16px;padding-right:16px}.topbar{padding:0 14px}.modelPill{display:none}.tableHead,.tableRow{grid-template-columns:1fr .7fr 1.4fr}.datasetHeader h1,.welcome h1{font-size:24px}}
      `}</style>
    </main>
  );
}
