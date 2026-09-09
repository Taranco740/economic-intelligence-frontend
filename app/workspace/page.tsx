"use client";

import { useEffect, useState } from "react";
import { createProject, getDatasets, getProjects, uploadDataset, type Dataset, type Project } from "../../lib/api";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

function friendlyError(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message : "";
  if (/supabase|api key|project.*url|environment variables|client/i.test(text)) {
    return "We couldn't connect to Gamuur right now. Please try again.";
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

  async function load() {
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setMessage("Gamuur is not configured yet. Please try again shortly.");
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setMessage("Sign in to use the dataset workspace."); return; }
      const items = await getProjects(session.access_token);
      setProjects(items);
      const selected = items[0] ?? null;
      setProject(selected);
      setDatasets(selected ? await getDatasets(session.access_token, selected.id) : []);
      setMessage(selected ? "Workspace ready." : "Create your first project to begin.");
    } catch (error) { setMessage(friendlyError(error, "Could not load workspace.")); }
  }

  useEffect(() => { void load(); }, []);

  async function makeProject() {
    if (!name.trim()) return;
    setBusy(true); setMessage("Creating project…");
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase environment variables are missing.");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in first.");
      const created = await createProject(session.access_token, name.trim());
      setProject(created); setProjects([created, ...projects]); setName(""); setDatasets([]); setMessage("Project created.");
    } catch (error) { setMessage(friendlyError(error, "Project creation failed.")); }
    finally { setBusy(false); }
  }

  async function handleUpload() {
    if (!project || !file) return;
    setBusy(true); setMessage("Validating and uploading dataset…");
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase environment variables are missing.");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in first.");
      const datasetName = file.name.replace(/\.(csv|xlsx)$/i, "").slice(0, 200) || "Dataset";
      const created = await uploadDataset(session.access_token, project.id, datasetName, file);
      setDatasets([created, ...datasets]); setFile(null); setMessage(`Dataset uploaded successfully — version ${created.current_version}.`);
    } catch (error) { setMessage(friendlyError(error, "Upload failed.")); }
    finally { setBusy(false); }
  }

  return <main className="page">
    <header><a href="/" className="brand"><span>G</span> Gamuur</a><a href="/">← Dashboard</a></header>
    <section className="hero"><div className="eyebrow">DATASET WORKSPACE</div><h1>Bring your data into Gamuur.</h1><p>Upload CSV or XLSX files. The backend validates and profiles them before saving a version to Supabase.</p></section>
    <section className="panel">
      <div className="panelHead"><div><div className="eyebrow">PROJECT</div><h2>{project?.name ?? "No project yet"}</h2></div><div className="status">{message}</div></div>
      {!project && <div className="create"><input value={name} onChange={e => setName(e.target.value)} placeholder="Project name" /><button disabled={busy || !name.trim()} onClick={makeProject}>Create project</button></div>}
      {project && <>
        <div className="upload"><label className="drop"><input type="file" accept=".csv,.xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)} /> <strong>{file ? file.name : "Choose a CSV or XLSX file"}</strong><small>Maximum 100 MB · validation and profiling happen on the server</small></label><button disabled={busy || !file} onClick={handleUpload}>{busy ? "Working…" : "Upload dataset"}</button></div>
        <div className="list"><div className="listHead"><strong>Datasets</strong><span>{datasets.length} total</span></div>{datasets.length === 0 ? <div className="empty">No datasets yet. Upload your first file above.</div> : datasets.map(d => <div className="row" key={d.id}><div><strong>{d.name}</strong><small>{d.source_type} · created {new Date(d.created_at).toLocaleString()}</small></div><span>v{d.current_version}</span></div>)}</div>
      </>}
    </section>
    <style jsx>{`body{margin:0}.page{min-height:100vh;background:#f6f7f3;color:#17201b;padding:0 28px;font-family:Inter,system-ui,sans-serif}header{max-width:1180px;margin:auto;height:78px;border-bottom:1px solid #dfe3dc;display:flex;justify-content:space-between;align-items:center}header a{color:#68716a;text-decoration:none;font-size:13px}.brand{font-size:18px!important;font-weight:800;color:#17201b!important;display:flex;gap:9px;align-items:center}.brand span{display:grid;place-items:center;width:30px;height:30px;background:#17201b;color:#fff;border-radius:9px}.hero{max-width:1180px;margin:0 auto;padding:78px 0 48px}.eyebrow{font-size:10px;font-weight:800;letter-spacing:.16em;color:#7b847d;margin-bottom:14px}.hero h1{font-size:clamp(44px,7vw,78px);line-height:.94;letter-spacing:-.065em;margin:0;max-width:800px}.hero p{max-width:650px;color:#6e776f;line-height:1.7;font-size:15px}.panel{max-width:1180px;margin:0 auto 80px;background:#fbfcfa;border:1px solid #dfe3dc;border-radius:18px;padding:28px}.panelHead{display:flex;justify-content:space-between;gap:20px;align-items:end;border-bottom:1px solid #e2e5e0;padding-bottom:22px}.panel h2{margin:0;font-size:28px;letter-spacing:-.04em}.status{font-size:12px;color:#6e776f}.create{display:flex;gap:10px;padding:28px 0}.create input,.upload input{font:inherit}.create input{flex:1;border:1px solid #d5dad4;border-radius:10px;padding:13px}.button,button{border:0;border-radius:10px;padding:13px 18px;background:#17201b;color:#fff;font-weight:750;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.upload{display:flex;gap:12px;align-items:center;padding:28px 0;border-bottom:1px solid #e2e5e0}.drop{flex:1;min-height:100px;border:1px dashed #b8c0b9;border-radius:13px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:7px;cursor:pointer}.drop input{display:none}.drop small,.row small{font-size:11px;color:#818981}.list{padding-top:26px}.listHead{display:flex;justify-content:space-between;margin-bottom:12px}.listHead span{font-size:11px;color:#818981}.empty{padding:30px;text-align:center;color:#818981;border:1px solid #e2e5e0;border-radius:12px}.row{display:flex;justify-content:space-between;align-items:center;padding:17px 0;border-top:1px solid #e2e5e0}.row div{display:flex;flex-direction:column;gap:5px}.row>span{font-size:11px;border:1px solid #dfe3dc;padding:5px 8px;border-radius:999px}@media(max-width:700px){.panelHead,.upload{align-items:stretch;flex-direction:column}.upload button{width:100%}.hero{padding-top:55px}}`}</style>
  </main>;
}
