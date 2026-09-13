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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setMessage("Sign in to use the dataset workspace.");
        return;
      }
      const items = await getProjects(session.access_token);
      setProjects(items);
      const selected = items[0] ?? null;
      setProject(selected);
      setDatasets(
        selected ? await getDatasets(session.access_token, selected.id) : [],
      );
      setMessage(selected ? "Dataset understood" : "Create your first project");
    } catch (error) {
      setMessage(friendlyError(error, "Could not load workspace."));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function makeProject() {
    if (!name.trim()) return;
    setBusy(true);
    setMessage("Creating project…");
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase environment variables are missing.");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in first.");
      const created = await createProject(session.access_token, name.trim());
      setProject(created);
      setProjects([created, ...projects]);
      setName("");
      setDatasets([]);
      setMessage("Project created.");
    } catch (error) {
      setMessage(friendlyError(error, "Project creation failed."));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload() {
    if (!project || !file) return;
    setBusy(true);
    setMessage("Understanding your dataset…");
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase environment variables are missing.");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in first.");
      const datasetName =
        file.name.replace(/\.(csv|xlsx)$/i, "").slice(0, 200) || "Dataset";
      const created = await uploadDataset(
        session.access_token,
        project.id,
        datasetName,
        file,
      );
      setDatasets([created, ...datasets]);
      setFile(null);
      setMessage(`Dataset understood — version ${created.current_version}.`);
    } catch (error) {
      setMessage(friendlyError(error, "Upload failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">G</div>
          <div className="brandName">Gamur</div>
        </div>

        <button className="newAnalysis" onClick={() => setFile(null)}>
          <span>+</span> New analysis
        </button>

        <div className="sidebarSection">
          <div className="sidebarLabel">DATASETS</div>
          {datasets.length === 0 ? (
            <div className="sidebarEmpty">No datasets yet</div>
          ) : (
            datasets.slice(0, 4).map((dataset) => (
              <div className="datasetItem active" key={dataset.id}>
                <div className="datasetIcon">XL</div>
                <div className="datasetInfo">
                  <div className="datasetName">{dataset.name}</div>
                  <div className="datasetMeta">
                    {dataset.source_type} · v{dataset.current_version}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sidebarSection">
          <div className="sidebarLabel">RECENT ANALYSES</div>
          <div className="historyItem">
            <div className="historyTitle">What matters in this data?</div>
            <div className="historyDate">Today</div>
          </div>
          <div className="historyItem">
            <div className="historyTitle">Which projects are over budget?</div>
            <div className="historyDate">Yesterday</div>
          </div>
          <div className="historyItem">
            <div className="historyTitle">Q3 status by project owner</div>
            <div className="historyDate">Sep 10</div>
          </div>
        </div>

        <div className="sidebarBottom">
          <div className="sidebarUser">
            <div className="userAvatar">G</div>
            <div className="userInfo">
              <div className="userName">Gamur workspace</div>
              <div className="userPlan">Personal workspace</div>
            </div>
            <span className="more">•••</span>
          </div>
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div className="fileContext">
            <div className="fileIcon">XL</div>
            <div>
              <div className="fileName">
                {datasets[0]?.name || "No dataset selected"}
              </div>
              <div className="fileStatus">
                <span className="statusDot" /> {message}
              </div>
            </div>
          </div>

          <div className="topActions">
            <div className="aiStatus">
              <span className="aiDot" /> Auto · best available
            </div>
            <button className="iconButton" aria-label="Settings">⚙</button>
            <button className="iconButton" aria-label="Help">?</button>
          </div>
        </header>

        <div className="workspace">
          <div className="content">
            {!project ? (
              <section className="emptyWorkspace">
                <div className="heroEyebrow">DATA INTELLIGENCE</div>
                <h1>Bring your data into Gamur.</h1>
                <p>
                  Create a project, upload CSV or XLSX data, and let Gamur
                  understand the structure before you decide what analysis to run.
                </p>
                <div className="createProject">
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Project name"
                  />
                  <button disabled={busy || !name.trim()} onClick={makeProject}>
                    Create project
                  </button>
                </div>
              </section>
            ) : (
              <>
                <section className="hero">
                  <div>
                    <div className="heroEyebrow">DATA INTELLIGENCE</div>
                    <h1>What matters in your data?</h1>
                    <p className="heroDescription">
                      Gamur turns your dataset into evidence, discoveries,
                      visual analysis, forecasts, and reports — without forcing
                      you into one AI provider.
                    </p>
                  </div>
                  <div className="heroActions">
                    <button className="secondaryButton">Export</button>
                    <button className="primaryButton">Full analysis</button>
                  </div>
                </section>

                {datasets.length === 0 ? (
                  <section className="uploadCard">
                    <div className="uploadIcon">↑</div>
                    <h2>Start with a dataset</h2>
                    <p>Upload a CSV or XLSX file and Gamur will profile it first.</p>
                    <label className="dropZone">
                      <input
                        type="file"
                        accept=".csv,.xlsx"
                        onChange={(event) =>
                          setFile(event.target.files?.[0] ?? null)
                        }
                      />
                      <strong>{file ? file.name : "Choose a CSV or XLSX file"}</strong>
                      <small>Validation and profiling happen on the server</small>
                    </label>
                    <button
                      className="primaryButton uploadButton"
                      disabled={busy || !file}
                      onClick={handleUpload}
                    >
                      {busy ? "Understanding…" : "Upload dataset"}
                    </button>
                  </section>
                ) : (
                  <>
                    <section className="stats">
                      <div className="statCard">
                        <div className="statTop"><span>ROWS</span><b>↕</b></div>
                        <div className="statNumber">—</div>
                        <div className="statNote">Detected from profile</div>
                      </div>
                      <div className="statCard">
                        <div className="statTop"><span>COLUMNS</span><b>▦</b></div>
                        <div className="statNumber">—</div>
                        <div className="statNote">Fields detected</div>
                      </div>
                      <div className="statCard">
                        <div className="statTop"><span>DATA QUALITY</span><b className="teal">✓</b></div>
                        <div className="statNumber tealText">—</div>
                        <div className="statNote">Profile result</div>
                      </div>
                      <div className="statCard">
                        <div className="statTop"><span>VERSION</span><b>v</b></div>
                        <div className="statNumber">v{datasets[0].current_version}</div>
                        <div className="statNote">Current dataset</div>
                      </div>
                    </section>

                    <section className="section">
                      <div className="sectionHeader">
                        <div>
                          <div className="sectionTitle">Key insights</div>
                          <div className="sectionSubtitle">The findings Gamur believes deserve attention</div>
                        </div>
                        <span className="sectionSubtitle">Ready for analysis</span>
                      </div>

                      <div className="insightGrid">
                        <div className="insight">
                          <div className="insightMarker" />
                          <div>
                            <h3>Understand the dataset first</h3>
                            <p>
                              Gamur will inspect structure, types, missing values,
                              duplicates, distributions, and relationships before
                              making business claims.
                            </p>
                            <div className="insightFooter">Run data profile →</div>
                          </div>
                        </div>
                        <div className="insight warning">
                          <div className="insightMarker" />
                          <div>
                            <h3>Find the unusual</h3>
                            <p>
                              Detect outliers, unexpected values, suspicious gaps,
                              and patterns that deserve a closer look.
                            </p>
                            <div className="insightFooter">Find anomalies →</div>
                          </div>
                        </div>
                        <div className="insight">
                          <div className="insightMarker" />
                          <div>
                            <h3>Turn evidence into visuals</h3>
                            <p>
                              Ask for charts, comparisons, trends, distributions,
                              or Power BI-style analytical views.
                            </p>
                            <div className="insightFooter">Build charts →</div>
                          </div>
                        </div>
                        <div className="insight warning">
                          <div className="insightMarker" />
                          <div>
                            <h3>Forecast only when the data is ready</h3>
                            <p>
                              Cleaning and validating the underlying data comes
                              before reliable forecasting or modeling.
                            </p>
                            <div className="insightFooter">Check readiness →</div>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="section">
                      <div className="sectionHeader">
                        <div>
                          <div className="sectionTitle">Analysis workspace</div>
                          <div className="sectionSubtitle">Choose what you want Gamur to do</div>
                        </div>
                      </div>
                      <div className="actionGrid">
                        <button className="actionCard"><span>⌁</span><strong>Clean data</strong><small>Missing values, duplicates, types</small></button>
                        <button className="actionCard"><span>◈</span><strong>Find relationships</strong><small>Correlations and important drivers</small></button>
                        <button className="actionCard"><span>▥</span><strong>Build charts</strong><small>Visualize the patterns that matter</small></button>
                        <button className="actionCard"><span>↗</span><strong>Forecast</strong><small>Model future trends when ready</small></button>
                        <button className="actionCard"><span>▤</span><strong>Create report</strong><small>Turn findings into an executive report</small></button>
                        <button className="actionCard"><span>↓</span><strong>Organize Excel</strong><small>Export a cleaned, structured dataset</small></button>
                      </div>
                    </section>

                    <section className="section">
                      <div className="sectionHeader">
                        <div>
                          <div className="sectionTitle">Dataset</div>
                          <div className="sectionSubtitle">Files currently available in this project</div>
                        </div>
                      </div>
                      <div className="panel">
                        {datasets.map((dataset) => (
                          <div className="datasetRow" key={dataset.id}>
                            <div className="rowIcon">XL</div>
                            <div className="rowInfo">
                              <strong>{dataset.name}</strong>
                              <small>{dataset.source_type} · version {dataset.current_version}</small>
                            </div>
                            <span className="versionBadge">v{dataset.current_version}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <footer className="composer">
          <div className="composerInner">
            <div className="quickActions">
              <button>Clean data</button>
              <button>Find outliers</button>
              <button>Build charts</button>
              <button>Forecast</button>
              <button>Create report</button>
            </div>
            <div className="composerBox">
              <button className="attach">+</button>
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask Gamur anything about this data…"
              />
              <div className="composerRight">
                <button className="modelSelect">Auto ▾</button>
                <button className="send">↑</button>
              </div>
            </div>
          </div>
        </footer>
      </section>

      <style jsx>{`
        :global(*) { box-sizing: border-box; }
        :global(body) { margin: 0; background: #f5f7fa; color: #172033; }
        :global(button), :global(input) { font: inherit; }
        :global(button) { cursor: pointer; }
        .app { height: 100vh; display: flex; overflow: hidden; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .sidebar { width: 250px; flex: none; background: #fff; border-right: 1px solid #e2e7ee; display: flex; flex-direction: column; }
        .brand { height: 64px; display: flex; align-items: center; gap: 10px; padding: 0 20px; border-bottom: 1px solid #e2e7ee; }
        .brandMark { width: 30px; height: 30px; border-radius: 9px; background: #132a4c; color: #fff; display: grid; place-items: center; font-size: 14px; font-weight: 800; }
        .brandName { color: #132a4c; font-size: 16px; font-weight: 800; }
        .newAnalysis { margin: 16px; height: 40px; border: 0; border-radius: 9px; background: #132a4c; color: #fff; font-size: 13px; font-weight: 700; }
        .newAnalysis:hover, .primaryButton:hover, .send:hover { background: #0d1f38; }
        .sidebarSection { padding: 4px 14px 0; }
        .sidebarLabel { padding: 10px 8px 7px; font-size: 10px; color: #8a94a3; font-weight: 800; letter-spacing: .08em; }
        .sidebarEmpty { padding: 10px 8px; color: #8a94a3; font-size: 11px; }
        .datasetItem { padding: 10px; border-radius: 9px; display: flex; gap: 10px; align-items: center; cursor: pointer; }
        .datasetItem:hover { background: #f5f7fa; }
        .datasetItem.active { background: #eef3fa; }
        .datasetIcon, .rowIcon { width: 30px; height: 30px; border-radius: 7px; background: #eaf1fb; color: #3e6bb5; display: grid; place-items: center; font-size: 10px; font-weight: 800; flex: none; }
        .datasetInfo { min-width: 0; }
        .datasetName { font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .datasetMeta, .historyDate { margin-top: 3px; font-size: 10.5px; color: #8a94a3; }
        .historyItem { padding: 9px 10px; border-radius: 8px; cursor: pointer; }
        .historyItem:hover { background: #f5f7fa; }
        .historyTitle { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sidebarBottom { margin-top: auto; border-top: 1px solid #e2e7ee; padding: 14px; }
        .sidebarUser { display: flex; align-items: center; gap: 9px; padding: 8px; border-radius: 9px; }
        .userAvatar { width: 30px; height: 30px; border-radius: 50%; background: #3e6bb5; color: #fff; display: grid; place-items: center; font-size: 11px; font-weight: 800; }
        .userInfo { flex: 1; }
        .userName { font-size: 12px; font-weight: 700; }
        .userPlan { font-size: 10px; color: #8a94a3; margin-top: 2px; }
        .more { color: #8a94a3; font-size: 11px; }
        .main { min-width: 0; flex: 1; display: flex; flex-direction: column; }
        .topbar { height: 64px; flex: none; background: #fff; border-bottom: 1px solid #e2e7ee; display: flex; align-items: center; justify-content: space-between; padding: 0 26px; }
        .fileContext { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .fileIcon { width: 34px; height: 34px; border-radius: 8px; background: #eef6f2; color: #1f9c86; display: grid; place-items: center; font-size: 11px; font-weight: 800; }
        .fileName { font-size: 13px; font-weight: 750; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 450px; }
        .fileStatus { display: flex; align-items: center; gap: 5px; margin-top: 3px; font-size: 10.5px; color: #647083; }
        .statusDot, .aiDot { width: 6px; height: 6px; border-radius: 50%; background: #1f9c86; }
        .topActions { display: flex; align-items: center; gap: 8px; }
        .aiStatus { height: 34px; padding: 0 12px; border: 1px solid #e2e7ee; border-radius: 18px; display: flex; align-items: center; gap: 7px; font-size: 11.5px; }
        .iconButton { width: 34px; height: 34px; border: 1px solid #e2e7ee; border-radius: 8px; background: #fff; color: #647083; }
        .iconButton:hover { background: #f5f7fa; }
        .workspace { flex: 1; overflow: auto; padding: 30px; }
        .content { width: 100%; max-width: 1050px; margin: 0 auto; }
        .hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 30px; margin-bottom: 24px; }
        .heroEyebrow { color: #3e6bb5; font-size: 10.5px; font-weight: 800; letter-spacing: .07em; margin-bottom: 7px; }
        .hero h1, .emptyWorkspace h1 { margin: 0; font-size: 34px; line-height: 1.12; letter-spacing: -.04em; color: #132a4c; }
        .heroDescription, .emptyWorkspace p { margin: 9px 0 0; max-width: 700px; color: #647083; font-size: 13px; line-height: 1.6; }
        .heroActions { display: flex; gap: 8px; flex: none; }
        .secondaryButton, .primaryButton { height: 36px; padding: 0 14px; border-radius: 8px; font-size: 11.5px; font-weight: 700; }
        .secondaryButton { border: 1px solid #d2d9e2; background: #fff; color: #172033; }
        .secondaryButton:hover { background: #f5f7fa; }
        .primaryButton { border: 0; background: #132a4c; color: #fff; }
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
        .statCard { background: #fff; border: 1px solid #e2e7ee; border-radius: 12px; padding: 16px; }
        .statTop { display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; color: #647083; font-weight: 700; }
        .statTop b { width: 25px; height: 25px; border-radius: 7px; background: #eaf1fb; color: #3e6bb5; display: grid; place-items: center; font-size: 11px; }
        .statTop b.teal { background: #eaf8f4; color: #1f9c86; }
        .statNumber { margin-top: 10px; font-size: 22px; font-weight: 800; color: #132a4c; }
        .tealText { color: #1f9c86; }
        .statNote { margin-top: 3px; font-size: 10.5px; color: #8a94a3; }
        .section { margin-bottom: 24px; }
        .sectionHeader { display: flex; align-items: center; justify-content: space-between; margin-bottom: 11px; }
        .sectionTitle { font-size: 14px; font-weight: 800; color: #132a4c; }
        .sectionSubtitle { font-size: 10.5px; color: #8a94a3; }
        .insightGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .insight { background: #fff; border: 1px solid #e2e7ee; border-radius: 12px; padding: 16px; display: flex; gap: 13px; }
        .insightMarker { width: 4px; border-radius: 4px; background: #1f9c86; flex: none; }
        .insight.warning .insightMarker { background: #d99024; }
        .insight h3 { margin: 0 0 5px; color: #132a4c; font-size: 12.5px; }
        .insight p { margin: 0; color: #647083; font-size: 11.5px; line-height: 1.55; }
        .insightFooter { margin-top: 10px; font-size: 10.5px; color: #3e6bb5; font-weight: 700; }
        .actionGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .actionCard { text-align: left; min-height: 105px; border: 1px solid #e2e7ee; background: #fff; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; align-items: flex-start; }
        .actionCard:hover { border-color: #bfc9d7; box-shadow: 0 5px 20px rgba(15,32,56,.05); transform: translateY(-1px); }
        .actionCard span { color: #3e6bb5; font-size: 18px; margin-bottom: 8px; }
        .actionCard strong { color: #132a4c; font-size: 12px; }
        .actionCard small { color: #8a94a3; font-size: 10.5px; line-height: 1.4; margin-top: 4px; }
        .panel { background: #fff; border: 1px solid #e2e7ee; border-radius: 12px; overflow: hidden; }
        .datasetRow { display: flex; align-items: center; gap: 12px; padding: 15px 16px; border-bottom: 1px solid #e2e7ee; }
        .datasetRow:last-child { border-bottom: 0; }
        .rowInfo { flex: 1; display: flex; flex-direction: column; gap: 4px; }
        .rowInfo strong { font-size: 12px; color: #132a4c; }
        .rowInfo small { font-size: 10.5px; color: #8a94a3; }
        .versionBadge { border: 1px solid #e2e7ee; border-radius: 999px; padding: 5px 8px; font-size: 10px; color: #647083; }
        .uploadCard, .emptyWorkspace { background: #fff; border: 1px solid #e2e7ee; border-radius: 16px; padding: 34px; text-align: center; }
        .uploadIcon { width: 44px; height: 44px; margin: 0 auto 12px; border-radius: 12px; background: #eaf8f4; color: #1f9c86; display: grid; place-items: center; font-size: 20px; font-weight: 800; }
        .uploadCard h2 { margin: 0; color: #132a4c; font-size: 20px; }
        .uploadCard p { margin: 7px 0 18px; color: #647083; font-size: 12px; }
        .dropZone { min-height: 120px; border: 1px dashed #b8c1cb; border-radius: 12px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 6px; cursor: pointer; }
        .dropZone:hover { background: #f8fafc; }
        .dropZone input { display: none; }
        .dropZone strong { color: #132a4c; font-size: 12px; }
        .dropZone small { color: #8a94a3; font-size: 10.5px; }
        .uploadButton { margin-top: 14px; }
        .createProject { display: flex; max-width: 560px; margin: 24px auto 0; gap: 9px; }
        .createProject input { flex: 1; min-width: 0; border: 1px solid #d2d9e2; border-radius: 9px; padding: 12px; outline: none; }
        .createProject input:focus { border-color: #3e6bb5; }
        .composer { flex: none; background: #fff; border-top: 1px solid #e2e7ee; padding: 13px 30px 17px; }
        .composerInner { max-width: 1050px; margin: 0 auto; }
        .quickActions { display: flex; gap: 7px; margin-bottom: 9px; overflow-x: auto; }
        .quickActions button { white-space: nowrap; height: 27px; padding: 0 10px; border: 1px solid #e2e7ee; border-radius: 14px; background: #fff; color: #647083; font-size: 10px; font-weight: 650; }
        .quickActions button:hover { background: #f5f7fa; color: #132a4c; }
        .composerBox { height: 48px; border: 1px solid #d2d9e2; border-radius: 12px; display: flex; align-items: center; padding: 5px; background: #fff; box-shadow: 0 3px 12px rgba(15,32,56,.04); }
        .attach { width: 36px; height: 36px; border: 0; background: transparent; color: #647083; border-radius: 8px; }
        .attach:hover { background: #f5f7fa; }
        .composerBox input { flex: 1; min-width: 0; height: 36px; border: 0; outline: 0; padding: 0 8px; font-size: 12px; color: #172033; }
        .composerBox input::placeholder { color: #8a94a3; }
        .composerRight { display: flex; align-items: center; gap: 7px; }
        .modelSelect { height: 32px; padding: 0 10px; border: 1px solid #e2e7ee; border-radius: 8px; background: #fff; color: #647083; font-size: 10.5px; }
        .send { width: 34px; height: 34px; border: 0; border-radius: 9px; background: #132a4c; color: #fff; font-weight: 800; }
        @media (max-width: 950px) { .sidebar { width: 215px; } .stats { grid-template-columns: repeat(2, 1fr); } .actionGrid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 720px) { .sidebar { display: none; } .workspace { padding: 20px 15px; } .topbar { padding: 0 15px; } .aiStatus { display: none; } .hero { flex-direction: column; } .hero h1, .emptyWorkspace h1 { font-size: 29px; } .insightGrid, .actionGrid { grid-template-columns: 1fr; } .composer { padding: 10px 15px 14px; } .modelSelect { display: none; } }
      `}</style>
    </main>
  );
}
