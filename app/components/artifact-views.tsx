"use client";

import { useMemo, useState } from "react";
import type { IntelligenceResult } from "../../lib/api";
import {
  downloadInteractiveDashboard,
  downloadReportPdf,
  downloadStatisticsPdf,
  downloadStatisticsWorkbook,
} from "../../lib/exports";

type Props = { tab: string; result: IntelligenceResult; datasetName?: string; onSelect: (value: any) => void };
type Visual = { type?: string; title?: string; xKey?: string; yKey?: string; data?: Array<Record<string, any>>; r?: number; category?: string; columns?: string[]; matrix?: Array<Array<number | null>>; min?: number; q1?: number; median?: number; q3?: number; max?: number; outlierCount?: number };

const colors = ["#16B8C4", "#7657D9", "#F59E0B", "#16A36A", "#E45757", "#3B82F6"];

function Kpi({ label, value, accent = colors[0] }: { label: string; value: any; accent?: string }) {
  return <div className="miniKpi" style={{ borderTop: `3px solid ${accent}` }}><span>{label}</span><b>{String(value)}</b></div>;
}

function LineChart({ visual }: { visual: Visual }) {
  const data = visual.data ?? []; const xKey = visual.xKey ?? "x"; const yKey = visual.yKey ?? "y";
  const values = data.map((r) => Number(r[yKey])).filter(Number.isFinite); if (!values.length) return <div className="visualEmpty">No numeric data available.</div>;
  const min = Math.min(...values), max = Math.max(...values), range = Math.max(1, max - min);
  const points = data.map((r, i) => `${40 + (i / Math.max(1, data.length - 1)) * 500},${210 - ((Number(r[yKey]) - min) / range) * 170}`).join(" ");
  return <svg viewBox="0 0 560 250" className="svgChart bigChart"><defs><linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#16B8C4" stopOpacity=".28"/><stop offset="1" stopColor="#16B8C4" stopOpacity="0"/></linearGradient></defs><line x1="40" y1="25" x2="40" y2="210" stroke="#CBD5E1"/><line x1="40" y1="210" x2="540" y2="210" stroke="#CBD5E1"/><polyline fill="none" stroke="#16B8C4" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points={points}/><polyline fill="url(#lineFill)" stroke="none" points={`40,210 ${points} 540,210`}/><text x="44" y="232">{xKey}</text><text x="470" y="232">{yKey}</text></svg>;
}

function BarChart({ visual }: { visual: Visual }) {
  const data = (visual.data ?? []).slice(0, 14); const xKey = visual.xKey ?? "x"; const yKey = visual.yKey ?? "y"; const max = Math.max(1, ...data.map((r) => Number(r[yKey]) || 0));
  return <svg viewBox="0 0 620 320" className="svgChart bigChart">{data.map((r, i) => { const h = 210 * (Number(r[yKey]) || 0) / max; const x = 48 + i * Math.max(24, 520 / Math.max(1, data.length)); return <g key={`${i}-${String(r[xKey])}`}><rect x={x} y={245 - h} width={Math.max(12, 420 / Math.max(1, data.length))} height={h} rx="6" fill={colors[i % colors.length]}/><text x={x} y="263" fontSize="8" transform={`rotate(-35 ${x} 263)`}>{String(r[xKey]).slice(0, 18)}</text><text x={x + 2} y={238 - h} fontSize="9" fill="#334155">{String(r[yKey])}</text></g>})}<line x1="40" y1="245" x2="585" y2="245" stroke="#CBD5E1"/></svg>;
}

function ScatterChart({ visual }: { visual: Visual }) {
  const data = visual.data ?? []; const xKey = visual.xKey ?? "x"; const yKey = visual.yKey ?? "y"; const xs = data.map((r) => Number(r[xKey])).filter(Number.isFinite); const ys = data.map((r) => Number(r[yKey])).filter(Number.isFinite); if (!xs.length || !ys.length) return <div className="visualEmpty">No scatter data available.</div>;
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys), xr = Math.max(1, xmax - xmin), yr = Math.max(1, ymax - ymin);
  return <svg viewBox="0 0 560 250" className="svgChart bigChart"><line x1="40" y1="25" x2="40" y2="210" stroke="#CBD5E1"/><line x1="40" y1="210" x2="540" y2="210" stroke="#CBD5E1"/>{data.slice(0,300).map((r,i)=><circle key={i} cx={40+((Number(r[xKey])-xmin)/xr)*500} cy={210-((Number(r[yKey])-ymin)/yr)*170} r="4" fill={colors[i%colors.length]} fillOpacity=".72"><title>{`${xKey}: ${r[xKey]} · ${yKey}: ${r[yKey]}`}</title></circle>)}<text x="44" y="232">{xKey}</text><text x="455" y="232">{yKey} · r {Number(visual.r ?? 0).toFixed(2)}</text></svg>;
}

function BoxPlot({ visual }: { visual: Visual }) {
  const min = Number(visual.min), q1 = Number(visual.q1), med = Number(visual.median), q3 = Number(visual.q3), max = Number(visual.max); const range = Math.max(1, max-min); const x = (v:number)=>50+((v-min)/range)*480;
  return <svg viewBox="0 0 560 180" className="svgChart"><line x1="50" y1="90" x2="530" y2="90" stroke="#CBD5E1" strokeWidth="2"/><line x1={x(min)} y1="65" x2={x(min)} y2="115" stroke="#7657D9" strokeWidth="3"/><line x1={x(max)} y1="65" x2={x(max)} y2="115" stroke="#7657D9" strokeWidth="3"/><line x1={x(min)} y1="90" x2={x(q1)} y2="90" stroke="#7657D9"/><line x1={x(q3)} y1="90" x2={x(max)} y2="90" stroke="#7657D9"/><rect x={x(q1)} y="55" width={Math.max(2,x(q3)-x(q1))} height="70" rx="8" fill="#16B8C4" fillOpacity=".35" stroke="#16B8C4" strokeWidth="3"/><line x1={x(med)} y1="55" x2={x(med)} y2="125" stroke="#173A5E" strokeWidth="4"/><text x="50" y="150">{visual.title ?? "Spread"}</text><text x="405" y="150">outliers: {visual.outlierCount ?? 0}</text></svg>;
}

function Heatmap({ visual }: { visual: Visual }) {
  const cols = visual.columns ?? []; const matrix = visual.matrix ?? []; const n = Math.min(cols.length, 12); const cell = 34;
  return <div className="heatmapWrap"><div className="heatmap" style={{ gridTemplateColumns: `110px repeat(${n}, ${cell}px)` }}>{<div/>}{cols.slice(0,n).map(c=><b key={c} className="heatLabel">{c.slice(0,10)}</b>)}{cols.slice(0,n).map((row,i)=><><b className="heatLabel">{row.slice(0,14)}</b>{cols.slice(0,n).map((_,j)=>{const v=Number(matrix[i]?.[j] ?? 0);const intensity=Math.min(1,Math.abs(v));const bg=v>=0?`rgba(22,184,196,${.12+.75*intensity})`:`rgba(118,87,217,${.12+.75*intensity})`;return <span key={`${i}-${j}`} title={`${row} × ${cols[j]}: ${v.toFixed(3)}`} style={{background:bg}}>{Number.isFinite(v)?v.toFixed(2):"—"}</span>})}</>)}</div></div>;
}

function Visual({ visual }: { visual: Visual }) { if (visual.type === "scatter") return <ScatterChart visual={visual}/>; if (visual.type === "box") return <BoxPlot visual={visual}/>; if (visual.type === "heatmap") return <Heatmap visual={visual}/>; if (visual.type === "bar" || visual.type === "histogram") return <BarChart visual={visual}/>; return <LineChart visual={visual}/>; }

function ActionBar({ children }: { children: React.ReactNode }) { return <div className="artifactActions">{children}</div>; }

export default function ArtifactViews({ tab, result, datasetName, onSelect }: Props) {
  const a = result.analysis ?? ({} as any); const stats = a.summary ?? []; const relationships = a.relationships ?? result.visualization?.relationships ?? []; const outliers = a.outliers ?? []; const visuals = (result.visualization?.visuals ?? result.visualization?.charts ?? []) as Visual[]; const title = datasetName || "Dataset";
  const [dashboardFilter, setDashboardFilter] = useState("all");
  const totalOutliers = useMemo(() => outliers.reduce((sum:number, item:any) => sum + (item.count || 0), 0), [outliers]);
  const filteredVisuals = visuals.filter((v) => dashboardFilter === "all" || v.category === dashboardFilter);

  if (tab === "visualize" || tab === "statistics") return <div className="artifactView">
    <section className="artifactHero visualHero"><div><span className="sectionTag">VISUALIZE + STATISTICS</span><h2>Numbers first. Visual evidence second.</h2><p>{title} · Statistics, analytical summaries and multiple chart types are built from the same completed investigation.</p></div><div className="heroBadge"><b>{visuals.length}</b><span>evidence views</span></div><ActionBar><button onClick={()=>downloadStatisticsWorkbook(title,result)}>Download Excel</button><button onClick={()=>downloadStatisticsPdf(title,result)}>Download PDF</button></ActionBar></section>
    <section className="statKpiRow"><Kpi label="OBSERVATIONS" value={(a.rows??0).toLocaleString()} accent={colors[0]}/><Kpi label="NUMERIC" value={(a.numeric_columns??[]).length} accent={colors[1]}/><Kpi label="CATEGORICAL" value={(a.categorical_columns??[]).length} accent={colors[2]}/><Kpi label="OUTLIER FLAGS" value={totalOutliers} accent={colors[4]}/><Kpi label="TARGET" value={a.target??"—"} accent={colors[3]}/></section>
    <section className="properTableBlock"><div className="sectionHead"><div><span className="sectionTag">STATISTICS</span><h2>Descriptive statistics</h2></div><span className="muted">Filterable in the downloaded workbook</span></div><div className="wideTable"><div className="wideRow wideHeader">{["Variable","N","Missing","Mean","Median","Std Dev","Min","Q1","Q3","Max","Range","IQR"].map(n=><b key={n}>{n}</b>)}</div>{stats.map((s:any)=><button className="wideRow" key={s.column} onClick={()=>onSelect(s)}><b>{s.column}</b><span>{s.count}</span><span>{s.missing??0}</span><span>{Number(s.mean??0).toFixed(3)}</span><span>{Number(s.median??0).toFixed(3)}</span><span>{Number(s.std??0).toFixed(3)}</span><span>{Number(s.min??0).toFixed(3)}</span><span>{Number(s.q1??0).toFixed(3)}</span><span>{Number(s.q3??0).toFixed(3)}</span><span>{Number(s.max??0).toFixed(3)}</span><span>{Number(s.range??0).toFixed(3)}</span><span>{Number(s.iqr??0).toFixed(3)}</span></button>)}</div></section>
    <section className="properTableBlock"><div className="sectionHead"><div><span className="sectionTag">RELATIONSHIPS</span><h2>What moves together</h2></div></div><div className="wideTable"><div className="wideRow wideHeader"><b>Variable A</b><b>Variable B</b><b>Correlation</b><b>Strength</b></div>{relationships.slice(0,20).map((r:any)=><button className="wideRow" key={`${r.x}-${r.y}`} onClick={()=>onSelect(r)}><b>{r.x}</b><span>{r.y}</span><span>{Number(r.r??0).toFixed(3)}</span><span>{r.strength??""}</span></button>)}</div></section>
    <section className="visualGrid">{visuals.map((visual,index)=><article className="visualCard visualCardLarge" key={`${visual.title??"visual"}-${index}`}><div className="visualCardHead"><div><span className="sectionTag">EVIDENCE {index+1}</span><h3>{visual.title??`${visual.type??"Visual"} analysis`}</h3></div><span className="muted">{visual.category??"evidence"}</span></div><Visual visual={visual}/></article>)}</section>
  </div>;

  if (tab === "dashboard") return <div className="artifactView">
    <section className="artifactHero dashboardHero"><div><span className="sectionTag">INTERACTIVE DASHBOARD</span><h2>{title}</h2><p>Explore signals, distributions, relationships and comparisons. Download the dashboard as a standalone interactive HTML file or as a PDF.</p></div><ActionBar><button onClick={()=>downloadInteractiveDashboard(title,result)}>Download interactive dashboard</button><button onClick={()=>downloadStatisticsPdf(title,result)}>Download PDF</button></ActionBar></section>
    <section className="statKpiRow"><Kpi label="ROWS" value={(a.rows??0).toLocaleString()} accent={colors[0]}/><Kpi label="FIELDS" value={a.columns??0} accent={colors[1]}/><Kpi label="RELATIONSHIPS" value={relationships.length} accent={colors[2]}/><Kpi label="OUTLIERS" value={totalOutliers} accent={colors[4]}/></section>
    <section className="dashboardFilters"><span>SHOW</span>{["all","trend","distribution","relationship","comparison"].map((f)=><button key={f} className={dashboardFilter===f?"active":""} onClick={()=>setDashboardFilter(f)}>{f}</button>)}</section>
    <section className="visualGrid dashboardGrid">{filteredVisuals.slice(0,16).map((visual,index)=><article className="visualCard visualCardLarge" key={`${index}-${visual.title??"dashboard"}`}><div className="visualCardHead"><div><span className="sectionTag">SIGNAL</span><h3>{visual.title??"Dataset signal"}</h3></div><span className="muted">{visual.category??""}</span></div><Visual visual={visual}/></article>)}</section>
  </div>;

  if (tab === "report") return <div className="artifactView">
    <section className="artifactHero reportHero"><div><span className="sectionTag">REPORT</span><h2>{result.report?.title??`${title} — Analysis Report`}</h2><p>A professional data report built from the same evidence already calculated by Gamur. Download it as a PDF instead of opening the print dialog.</p></div><ActionBar><button onClick={()=>downloadReportPdf(title,result)}>Download PDF</button><button onClick={()=>downloadStatisticsWorkbook(title,result)}>Download Excel evidence</button></ActionBar></section>
    <section className="properTableBlock"><div className="sectionHead"><div><span className="sectionTag">EXECUTIVE FINDINGS</span><h2>What the evidence says</h2></div></div><div className="reportText">{result.insights||"Computed evidence is ready. Review the statistical and visual evidence for the next decision."}</div></section>
    <section className="properTableBlock"><div className="sectionHead"><div><span className="sectionTag">QUESTIONS & ANSWERS</span><h2>What this dataset can answer</h2></div></div><div className="questionGrid">{(result.questions??[]).map((q:any,index:number)=><button key={index} className="questionCard" onClick={()=>onSelect(q)}><span>{String(index+1).padStart(2,"0")}</span><b>{q.question}</b><small>{q.answer}</small></button>)}</div></section>
    <section className="visualGrid">{visuals.slice(0,6).map((visual,index)=><article className="visualCard" key={index}><div className="visualCardHead"><div><span className="sectionTag">EVIDENCE</span><h3>{visual.title}</h3></div></div><Visual visual={visual}/></article>)}</section>
  </div>;

  return null;
}
