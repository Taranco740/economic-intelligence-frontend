"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";
import {
  createProject,
  getProjects,
  uploadDataset,
  runIntelligence,
  getHistory,
  createHistory,
  renameHistory,
  deleteHistory,
  askData,
  type Project,
  type Dataset,
  type IntelligenceResult,
  type HistoryItem,
} from "../../lib/api";
import ArtifactViews from "./artifact-views";
import ForecastView from "./forecast-view";

type Tab = "analyze" | "visualize" | "dashboard" | "forecast" | "report";

const tabs: Array<[Tab, string]> = [
  ["analyze", "Analytics"],
  ["visualize", "Visualize + Statistics"],
  ["dashboard", "Dashboard"],
  ["forecast", "Forecast"],
  ["report", "Report"],
];

const askLabels: Record<Tab, string> = {
  analyze: "Ask Analytics",
  visualize: "Ask Visualize + Statistics",
  dashboard: "Ask Dashboard",
  forecast: "Ask Forecast",
  report: "Ask Report",
};

function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      {text.split(/\r?\n/).map((line, index) => {
        const value = line.trim();
        if (!value) return <div key={index} style={{ height: 6 }} />;
        const heading = value.match(/^#{1,4}\s+(.*)$/);
        if (heading) return <p key={index}><strong>{heading[1]}</strong></p>;
        if (/^[-*]\s+/.test(value)) {
          return <p key={index}>• {value.replace(/^[-*]\s+/, "")}</p>;
        }
        return <p key={index}>{value}</p>;
      })}
    </div>
  );
}

export default function Workspace() {
  const [tab, setTab] = useState<Tab>("analyze");
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [result, setResult] = useState<IntelligenceResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [chat, setChat] = useState<Array<{ role: string; text: string }>>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sb = createSupabaseBrowserClient();

  useEffect(() => {
    if (!sb) return;
    void sb.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      try {
        const [loadedProjects, loadedHistory] = await Promise.all([
          getProjects(data.session.access_token),
          getHistory(data.session.access_token),
        ]);
        setProjects(loadedProjects);
        setHistory(loadedHistory);
        if (loadedProjects[0]) setProject(loadedProjects[0]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load Gamur.");
      }
    });
  }, [sb]);

  const token = async () => {
    const session = await sb?.auth.getSession();
    return session?.data.session?.access_token || "";
  };

  const context = useMemo(() => {
    if (!result) return "";
    return JSON.stringify({
      workspace: tab,
      dataset: dataset?.name,
      analysis: result.analysis,
      visualization: result.visualization,
      questions: result.questions,
      insights: result.insights,
      forecasting: result.forecasting,
    });
  }, [result, dataset, tab]);

  const run = async (file?: File) => {
    setBusy(true);
    setError("");
    try {
      const authToken = await token();
      if (!authToken) throw new Error("Please sign in first.");

      let currentProject = project;
      if (!currentProject) {
        currentProject = await createProject(
          authToken,
          file?.name.replace(/\.(csv|xlsx)$/i, "") || "My analysis"
        );
        setProject(currentProject);
        setProjects((items) => [currentProject!, ...items]);
      }

      let currentDataset = dataset;
      if (file) {
        currentDataset = await uploadDataset(
          authToken,
          currentProject.id,
          file.name.replace(/\.(csv|xlsx)$/i, ""),
          file
        );
      }
      if (!currentDataset) throw new Error("Upload a CSV or XLSX dataset first.");
      setDataset(currentDataset);

      const instruction =
        prompt.trim() ||
        "Automatically investigate this dataset comprehensively. Infer the likely domain and purpose. Clean and profile the data, identify domain-specific signals, anomalies, relationships, trends, risks, opportunities and data-quality gaps, answer useful questions with computed evidence, determine forecastability, and prepare reusable evidence for visualization plus statistics, dashboard, forecast and report.";

      const analysis = await runIntelligence(
        authToken,
        currentProject.id,
        currentDataset.id,
        instruction,
        ["cleaning", "analysis", "forecasting", "insights", "visualization", "report"]
      );

      setResult(analysis);
      const saved = await createHistory(
        authToken,
        currentProject.id,
        currentDataset.name || "Analysis",
        "full",
        currentDataset.id,
        analysis
      );
      setHistory((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setPrompt("");
      setTab("analyze");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gamur could not complete the analysis.");
    } finally {
      setBusy(false);
    }
  };

  const openHistory = (item: HistoryItem) => {
    setError("");
    setProject(projects.find((p) => p.id === item.project_id) || null);
    setDataset(
      item.dataset_id
        ? {
            id: item.dataset_id,
            project_id: item.project_id,
            name: item.title || "Saved analysis",
            source_type: "",
            description: null,
            current_version: 0,
            created_at: item.created_at,
            updated_at: item.created_at,
          }
        : null
    );
    setResult(item.result && Object.keys(item.result).length ? item.result : null);
    setChat([]);
    setTab("analyze");
    if (!item.result || !Object.keys(item.result).length) {
      setError("This older analysis has no saved snapshot. Re-run it once to create one.");
    }
  };

  const sendChat = async () => {
    const question = prompt.trim();
    if (!question || busy) return;
    setPrompt("");
    setChat((items) => [...items, { role: "user", text: question }]);
    try {
      const answer = await askData(
        await token(),
        `${askLabels[tab]}: ${question}`,
        context
      );
      setChat((items) => [...items, { role: "assistant", text: answer.answer }]);
    } catch (e) {
      setChat((items) => [
        ...items,
        { role: "assistant", text: e instanceof Error ? e.message : "Assistant unavailable." },
      ]);
    }
  };

  const deleteSaved = async () => {
    if (!deleteId) return;
    try {
      await deleteHistory(await token(), deleteId);
      setHistory((items) => items.filter((item) => item.id !== deleteId));
      setDeleteId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete analysis.");
    }
  };

  const renameSaved = async () => {
    if (!renameId) return;
    try {
      const updated = await renameHistory(
        await token(),
        renameId,
        renameValue.trim() || "Analysis"
      );
      setHistory((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename analysis.");
    }
    setRenameId(null);
  };

  const analysis = result?.analysis;
  const relationships = analysis?.relationships || result?.visualization?.relationships || [];
  const questions = result?.questions || [];
  const outliers = analysis?.outliers || [];

  let body: React.ReactNode;

  if (!result) {
    body = (
      <section className="landing">
        <div className="landingBadge">✦ AUTOMATIC INVESTIGATION</div>
        <h2>Upload your data.<br /><em>Gamur answers.</em></h2>
        <p>
          Bring in a CSV or XLSX and Gamur automatically cleans, profiles and investigates it.
          When analysis is complete, every workspace reuses the same evidence.
        </p>
        <button className="dropzone" onClick={() => inputRef.current?.click()} disabled={busy}>
          <span className="uploadIcon">↑</span>
          <strong>{busy ? "Investigating…" : "Attach your data"}</strong>
          <small>CSV or XLSX · automatic investigation</small>
        </button>
        <div className="featureGrid">
          <div><b>01</b><strong>Signals</strong><span>What matters most</span></div>
          <div><b>02</b><strong>Anomalies</strong><span>What needs attention</span></div>
          <div><b>03</b><strong>Relationships</strong><span>What moves together</span></div>
          <div><b>04</b><strong>Questions</strong><span>What the data can answer</span></div>
        </div>
      </section>
    );
  } else if (tab === "analyze") {
    body = (
      <div className="results">
        <section className="readout">
          <div className="readoutMain">
            <span className="sectionTag">ANALYTICS</span>
            <h2>What is happening?</h2>
            <Markdown text={result.insights || "Gamur found measurable patterns in the completed analysis."} />
            <div className="evidenceLine">
              <span>Evidence-led</span>
              <span>{analysis?.numeric_columns?.length || 0} numeric fields</span>
              <span>{analysis?.target ? `Target: ${analysis.target}` : "Descriptive analysis"}</span>
            </div>
          </div>
          <div className="readoutSide">
            <span>INVESTIGATION</span>
            <b>Complete</b>
            <small>Evidence is reusable across all workspaces</small>
          </div>
        </section>

        <div className="signalGrid">
          <div className="signal">
            <span>STRONGEST SIGNAL</span>
            <b>{relationships[0]?.x || "—"}</b>
            <strong>{relationships[0] ? `r = ${Number(relationships[0].r).toFixed(2)}` : "—"}</strong>
            <small>{analysis?.target ? `relationship with ${analysis.target}` : "Primary relationship"}</small>
          </div>
          <div className="signal">
            <span>OBSERVATIONS</span>
            <b>{analysis?.rows?.toLocaleString() || 0}</b>
            <strong>{analysis?.columns || 0} fields</strong>
            <small>after preparation</small>
          </div>
          <div className="signal">
            <span>ANOMALIES</span>
            <b>{outliers.reduce((total, item) => total + item.count, 0)}</b>
            <strong>outlier flags</strong>
            <small>IQR screening</small>
          </div>
          <div className="signal">
            <span>QUESTIONS</span>
            <b>{questions.length}</b>
            <strong>answered</strong>
            <small>evidence-supported</small>
          </div>
        </div>

        <section className="section">
          <div className="sectionHead">
            <div><span className="sectionTag">DISCOVERIES</span><h2>What Gamur found</h2></div>
            <span className="muted">Computed evidence, not generic text</span>
          </div>
          <div className="discoveryGrid">
            {relationships.slice(0, 8).map((item: any, index: number) => (
              <button className="discovery" key={index} onClick={() => setSelected(item)}>
                <div className="discoveryTop">
                  <span className="pill">{item.strength || "Association"}</span>
                  <b>r {Number(item.r).toFixed(2)}</b>
                </div>
                <h3>{item.x} <i>↔</i> {item.y}</h3>
                <p>Measured relationship in the observed data. Inspect the evidence before interpreting it.</p>
                <span className="explore">Inspect evidence ↗</span>
              </button>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="sectionHead"><div><span className="sectionTag">QUESTIONS</span><h2>Questions your data can answer</h2></div></div>
          <div className="questionGrid">
            {questions.map((item: any, index: number) => (
              <button className="question" key={index} onClick={() => setSelected(item)}>
                <span className="qNum">{String(index + 1).padStart(2, "0")}</span>
                <div><b>{item.question}</b><small>{item.answer}</small></div>
                <span>→</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  } else if (tab === "forecast" && dataset) {
    body = <ForecastView result={result} dataset={dataset} token={token} datasetName={dataset.name} />;
  } else {
    body = <ArtifactViews tab={tab} result={result} datasetName={dataset?.name} onSelect={setSelected} />;
  }

  return (
    <div className="workspace">
      <aside className="history">
        <div className="brand"><b>G</b><span>Gamur</span></div>
        <button className="new" onClick={() => { setResult(null); setDataset(null); setChat([]); setPrompt(""); setError(""); setTab("analyze"); }}>
          ＋ New analysis
        </button>
        <div className="historyTitle">RECENT ANALYSES</div>
        {history.length ? history.map((item) => (
          <div className="historyRow" key={item.id}>
            <button className="historyItem" onClick={() => openHistory(item)}>
              <span className="historyDot" />
              <div><b>{item.title || "Analysis"}</b><small>{new Date(item.created_at).toLocaleDateString()}</small></div>
            </button>
            <button className="renameBtn" onClick={() => { setRenameId(item.id); setRenameValue(item.title || ""); }}>•••</button>
            <button className="deleteBtn" onClick={() => setDeleteId(item.id)}>×</button>
          </div>
        )) : <p className="empty">Your saved analyses will appear here.</p>}
      </aside>

      <section className="work">
        <header className="appHeader">
          <nav className="tabs">
            {tabs.map(([id, label]) => (
              <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>
          <div className="profileWrap">
            <button className="profile" onClick={() => setProfileOpen((value) => !value)}>G</button>
            {profileOpen && (
              <div className="profileMenu">
                <b>Gamur account</b><span>Signed in</span>
                <a href="/profile">Profile</a><a href="/settings">Settings</a>
                <button onClick={() => sb?.auth.signOut()}>Sign out</button>
              </div>
            )}
          </div>
        </header>

        <main className="content">
          <input ref={inputRef} hidden type="file" accept=".csv,.xlsx" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && /\.(csv|xlsx)$/i.test(file.name)) void run(file);
            else if (file) setError("Use CSV or XLSX files.");
          }} />

          <div className="topline">
            <div>
              <span className="eyebrow">DATA INTELLIGENCE</span>
              <h1>{dataset?.name || "Bring data to life."}</h1>
              <p>
                {dataset
                  ? `${analysis?.rows?.toLocaleString() || "—"} observations · ${analysis?.columns || "—"} fields · completed investigation ready to reuse across every workspace.`
                  : "Upload an Excel or CSV file. Gamur investigates it automatically."}
              </p>
            </div>
            <select value={project?.id || ""} onChange={(event) => {
              setProject(projects.find((item) => item.id === event.target.value) || null);
              setDataset(null); setResult(null); setChat([]);
            }}>
              <option value="">Project</option>
              {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          {error && <div className="error">{error}</div>}
          {body}

          {chat.length > 0 && (
            <section className="chatPanel">
              <div className="chatHeader"><span>{askLabels[tab]}</span><small>Context: completed analysis</small></div>
              {chat.map((message, index) => (
                <div className={message.role === "user" ? "chatUser" : "chatAssistant"} key={index}>
                  <b>{message.role === "user" ? "You" : "Gamur"}</b><p>{message.text}</p>
                </div>
              ))}
            </section>
          )}
        </main>

        <footer className="composer">
          <div className="composerLabel">{askLabels[tab]}</div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendChat();
              }
            }}
            placeholder={result ? `Ask Gamur about ${tab === "analyze" ? "your analysis" : tab === "visualize" ? "visuals and statistics" : tab}` : "Describe an analysis goal or upload your data…"}
          />
          <button onClick={() => inputRef.current?.click()}>Attach</button>
          <button className="run" disabled={busy} onClick={() => prompt.trim() ? void sendChat() : void run()}>
            {busy ? "Working…" : prompt.trim() ? "Ask →" : "Analyze data"}
          </button>
        </footer>
      </section>

      {selected && (
        <div className="modalShade" onClick={() => setSelected(null)}>
          <article className="detailPanel" onClick={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => setSelected(null)}>×</button>
            <span className="sectionTag">EVIDENCE DETAIL</span>
            <h2>{selected.question || `${selected.x || "Finding"} ${selected.y ? `↔ ${selected.y}` : ""}`}</h2>
            {selected.r !== undefined && <div className="detailMetric"><b>r = {Number(selected.r).toFixed(3)}</b><span>{selected.strength || "Measured association"}</span></div>}
            <p>{selected.answer || `The measured relationship is ${Number(selected.r).toFixed(3)}. Association in observed data does not by itself establish causation.`}</p>
          </article>
        </div>
      )}

      {renameId && (
        <div className="modalShade"><article className="renamePanel">
          <h3>Rename analysis</h3><input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
          <div><button onClick={() => setRenameId(null)}>Cancel</button><button className="run" onClick={() => void renameSaved()}>Save name</button></div>
        </article></div>
      )}

      {deleteId && (
        <div className="modalShade"><article className="renamePanel">
          <h3>Delete this analysis?</h3><p>This removes the saved history entry. The uploaded dataset is not deleted.</p>
          <div><button onClick={() => setDeleteId(null)}>Cancel</button><button className="run danger" onClick={() => void deleteSaved()}>Delete</button></div>
        </article></div>
      )}
    </div>
  );
}
