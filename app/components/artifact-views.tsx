"use client";

import { useMemo } from "react";
import * as XLSX from "xlsx-js-style";
import type { IntelligenceResult } from "../../lib/api";

type Props = {
  tab: string;
  result: IntelligenceResult;
  datasetName?: string;
  onSelect: (value: any) => void;
};

type Visual = {
  type?: string;
  title?: string;
  xKey?: string;
  yKey?: string;
  data?: Array<Record<string, any>>;
  r?: number;
  category?: string;
};

const navy = "17201b";
const pale = "F4F7F4";

function makeWorkbook(sheets: Array<{ name: string; rows: any[][] }>) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    const first = sheet.rows[0] ?? [];
    ws["!cols"] = first.map((_, column) => {
      const width = Math.max(
        12,
        ...sheet.rows.slice(0, 30).map((row) => String(row[column] ?? "").length + 2),
      );
      return { wch: Math.min(36, width) };
    });
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) {
        cell.s = {
          font: { bold: true, color: "FFFFFF", sz: 11 },
          fill: { fgColor: { rgb: navy } },
          alignment: { vertical: "center" },
        };
      }
    }
    for (let r = 1; r <= range.e.r; r += 1) {
      for (let c = 0; c <= range.e.c; c += 1) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell) {
          cell.s = {
            fill: { fgColor: { rgb: r % 2 ? "FFFFFF" : pale } },
            alignment: { vertical: "center" },
          };
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  return wb;
}

function downloadStatistics(name: string, result: IntelligenceResult) {
  const a = result.analysis ?? ({} as any);
  const stats = a.summary ?? [];
  const categories = a.categorical_summary ?? [];
  const relationships = a.relationships ?? [];
  const outliers = a.outliers ?? [];

  const wb = makeWorkbook([
    {
      name: "Overview",
      rows: [
        ["Gamur Statistical Analysis"],
        ["Dataset", name],
        ["Observations", a.rows ?? 0],
        ["Fields", a.columns ?? 0],
        ["Numeric fields", (a.numeric_columns ?? []).length],
        ["Categorical fields", (a.categorical_columns ?? []).length],
        ["Target", a.target ?? ""],
      ],
    },
    {
      name: "Descriptive Statistics",
      rows: [
        ["Variable", "N", "Missing", "Unique", "Mean", "Median", "Std Dev", "Variance", "Min", "Q1", "Q3", "Max", "Range", "IQR", "P05", "P10", "P90", "P95"],
        ...stats.map((s: any) => [s.column, s.count, s.missing ?? 0, s.unique ?? 0, s.mean, s.median, s.std, s.variance, s.min, s.q1, s.q3, s.max, s.range, s.iqr, s.p05, s.p10, s.p90, s.p95]),
      ],
    },
    {
      name: "Pivot Summary",
      rows: [
        ["Variable", "Mean", "Median", "Min", "Max", "Std Dev", "Outlier Count"],
        ...stats.map((s: any) => [s.column, s.mean, s.median, s.min, s.max, s.std, outliers.find((o: any) => o.column === s.column)?.count ?? 0]),
      ],
    },
    {
      name: "Categories",
      rows: [
        ["Field", "Value", "Count", "Share"],
        ...categories.flatMap((c: any) => (c.top_values ?? []).map((v: any) => [c.column, v.value, v.count, v.share])),
      ],
    },
    {
      name: "Correlations",
      rows: [
        ["Variable A", "Variable B", "Correlation", "Strength"],
        ...relationships.map((r: any) => [r.x, r.y, r.r, r.strength]),
      ],
    },
    {
      name: "Outliers",
      rows: [
        ["Variable", "Flagged Rows", "Rate", "Lower Bound", "Upper Bound"],
        ...outliers.map((o: any) => [o.column, o.count, o.rate, o.lower, o.upper]),
      ],
    },
    {
      name: "Data Quality",
      rows: [
        ["Metric", "Value"],
        ["Rows after cleaning", result.cleaning?.rows_after ?? a.rows ?? 0],
        ["Cleaning actions", result.cleaning?.changes?.length ?? 0],
        ["Date fields detected", (a.date_columns ?? []).length],
        ["Numeric fields", (a.numeric_columns ?? []).length],
        ["Categorical fields", (a.categorical_columns ?? []).length],
      ],
    },
  ]);

  XLSX.writeFile(wb, `${name || "gamur"}-visual-statistics.xlsx`);
}

function LineChart({ visual }: { visual: Visual }) {
  const data = visual.data ?? [];
  const xKey = visual.xKey ?? "x";
  const yKey = visual.yKey ?? "y";
  if (!data.length) return <div className="visualEmpty">No chart data available.</div>;
  const values = data.map((row) => Number(row[yKey])).filter(Number.isFinite);
  if (!values.length) return <div className="visualEmpty">No numeric chart data available.</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = data
    .map((row, index) => `${36 + (index / Math.max(1, data.length - 1)) * 500},${188 - ((Number(row[yKey]) - min) / range) * 150}`)
    .join(" ");
  return (
    <svg viewBox="0 0 560 220" className="svgChart" role="img" aria-label={visual.title ?? "Line chart"}>
      <line x1="36" y1="18" x2="36" y2="188" />
      <line x1="36" y1="188" x2="540" y2="188" />
      <polyline fill="none" stroke="currentColor" strokeWidth="3" points={points} />
      <text x="40" y="207">{xKey}</text>
      <text x="430" y="207">{yKey}</text>
    </svg>
  );
}

function BarChart({ visual }: { visual: Visual }) {
  const data = (visual.data ?? []).slice(0, 14);
  const xKey = visual.xKey ?? "x";
  const yKey = visual.yKey ?? "y";
  const max = Math.max(1, ...data.map((row) => Number(row[yKey]) || 0));
  return (
    <svg viewBox="0 0 620 280" className="svgChart" role="img" aria-label={visual.title ?? "Bar chart"}>
      {data.map((row, index) => {
        const y = 12 + index * 18;
        const width = 500 * (Number(row[yKey]) || 0) / max;
        return (
          <g key={`${index}-${String(row[xKey])}`}>
            <text x="4" y={y + 11} fontSize="9">{String(row[xKey]).slice(0, 22)}</text>
            <rect x="120" y={y} width={width} height="11" rx="3" />
            <text x={125 + width} y={y + 10} fontSize="9">{String(row[yKey])}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ScatterChart({ visual }: { visual: Visual }) {
  const data = visual.data ?? [];
  const xKey = visual.xKey ?? "x";
  const yKey = visual.yKey ?? "y";
  const xs = data.map((row) => Number(row[xKey])).filter(Number.isFinite);
  const ys = data.map((row) => Number(row[yKey])).filter(Number.isFinite);
  if (!xs.length || !ys.length) return <div className="visualEmpty">No scatter data available.</div>;
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const xr = Math.max(1, xmax - xmin), yr = Math.max(1, ymax - ymin);
  return (
    <svg viewBox="0 0 560 220" className="svgChart" role="img" aria-label={visual.title ?? "Scatter plot"}>
      <line x1="36" y1="18" x2="36" y2="188" />
      <line x1="36" y1="188" x2="540" y2="188" />
      {data.slice(0, 300).map((row, index) => (
        <circle key={index} cx={36 + ((Number(row[xKey]) - xmin) / xr) * 500} cy={188 - ((Number(row[yKey]) - ymin) / yr) * 150} r="3">
          <title>{`${xKey}: ${row[xKey]} · ${yKey}: ${row[yKey]}`}</title>
        </circle>
      ))}
      <text x="40" y="207">{xKey}</text>
      <text x="420" y="207">{yKey} · r {Number(visual.r ?? 0).toFixed(2)}</text>
    </svg>
  );
}

function Visual({ visual }: { visual: Visual }) {
  if (visual.type === "scatter") return <ScatterChart visual={visual} />;
  if (visual.type === "bar" || visual.type === "histogram") return <BarChart visual={visual} />;
  return <LineChart visual={visual} />;
}

function Kpi({ label, value }: { label: string; value: any }) {
  return <div className="miniKpi"><span>{label}</span><b>{String(value)}</b></div>;
}

export default function ArtifactViews({ tab, result, datasetName, onSelect }: Props) {
  const a = result.analysis ?? ({} as any);
  const stats = a.summary ?? [];
  const relationships = a.relationships ?? result.visualization?.relationships ?? [];
  const outliers = a.outliers ?? [];
  const visuals = (result.visualization?.visuals ?? result.visualization?.charts ?? []) as Visual[];
  const title = datasetName || "Dataset";
  const totalOutliers = useMemo(() => outliers.reduce((sum: number, item: any) => sum + (item.count || 0), 0), [outliers]);

  if (tab === "visualize" || tab === "statistics") {
    return (
      <div className="artifactView">
        <section className="artifactHero visualHero">
          <div>
            <span className="sectionTag">VISUALIZE + STATISTICS</span>
            <h2>See the numbers. Then understand them.</h2>
            <p>Gamur combines descriptive statistics, pivot-style summaries, relationships, anomalies and automatically selected visual evidence in one workspace.</p>
          </div>
          <div className="heroBadge"><b>{visuals.length}</b><span>visual evidence views</span></div>
          <div className="artifactActions">
            <button onClick={() => downloadStatistics(title, result)}>Download Excel</button>
            <button onClick={() => window.print()}>Save PDF</button>
          </div>
        </section>

        <section className="statKpiRow">
          <Kpi label="OBSERVATIONS" value={(a.rows ?? 0).toLocaleString()} />
          <Kpi label="NUMERIC" value={(a.numeric_columns ?? []).length} />
          <Kpi label="CATEGORICAL" value={(a.categorical_columns ?? []).length} />
          <Kpi label="OUTLIER FLAGS" value={totalOutliers} />
          <Kpi label="TARGET" value={a.target ?? "—"} />
        </section>

        <section className="properTableBlock">
          <div className="sectionHead"><div><span className="sectionTag">DESCRIPTIVE STATISTICS</span><h2>Analyst table</h2></div></div>
          <div className="wideTable">
            <div className="wideRow wideHeader">{["Variable", "N", "Missing", "Mean", "Median", "Std Dev", "Min", "Q1", "Q3", "Max", "Range", "IQR"].map((name) => <b key={name}>{name}</b>)}</div>
            {stats.map((s: any) => (
              <button className="wideRow" key={s.column} onClick={() => onSelect(s)}>
                <b>{s.column}</b><span>{s.count}</span><span>{s.missing ?? 0}</span><span>{Number(s.mean ?? 0).toFixed(3)}</span><span>{Number(s.median ?? 0).toFixed(3)}</span><span>{Number(s.std ?? 0).toFixed(3)}</span><span>{Number(s.min ?? 0).toFixed(3)}</span><span>{Number(s.q1 ?? 0).toFixed(3)}</span><span>{Number(s.q3 ?? 0).toFixed(3)}</span><span>{Number(s.max ?? 0).toFixed(3)}</span><span>{Number(s.range ?? 0).toFixed(3)}</span><span>{Number(s.iqr ?? 0).toFixed(3)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="properTableBlock">
          <div className="sectionHead"><div><span className="sectionTag">RELATIONSHIPS</span><h2>What moves together</h2></div></div>
          <div className="wideTable">
            <div className="wideRow wideHeader"><b>Variable A</b><b>Variable B</b><b>Correlation</b><b>Strength</b></div>
            {relationships.slice(0, 20).map((r: any) => <button className="wideRow" key={`${r.x}-${r.y}`} onClick={() => onSelect(r)}><b>{r.x}</b><span>{r.y}</span><span>{Number(r.r ?? 0).toFixed(3)}</span><span>{r.strength ?? ""}</span></button>)}
          </div>
        </section>

        <section className="visualGrid">
          {visuals.map((visual, index) => (
            <article className="visualCard" key={`${visual.title ?? "visual"}-${index}`}>
              <div className="visualCardHead"><div><span className="sectionTag">EVIDENCE {index + 1}</span><h3>{visual.title ?? `${visual.type ?? "Visual"} analysis`}</h3></div><span className="muted">{visual.xKey ?? ""} {visual.yKey ? `× ${visual.yKey}` : ""}</span></div>
              <Visual visual={visual} />
            </article>
          ))}
          {!visuals.length && <div className="visualEmpty">Gamur has computed the statistics, but no chart-ready visual evidence is available for this dataset yet.</div>}
        </section>
      </div>
    );
  }

  if (tab === "dashboard") {
    return (
      <div className="artifactView">
        <section className="artifactHero dashboardHero"><div><span className="sectionTag">INTERACTIVE DASHBOARD</span><h2>{title}</h2><p>A decision-focused view of the strongest signals, relationships and data-quality flags discovered by Gamur.</p></div></section>
        <section className="statKpiRow"><Kpi label="ROWS" value={(a.rows ?? 0).toLocaleString()} /><Kpi label="FIELDS" value={a.columns ?? 0} /><Kpi label="RELATIONSHIPS" value={relationships.length} /><Kpi label="OUTLIERS" value={totalOutliers} /><Kpi label="TARGET" value={a.target ?? "—"} /></section>
        <section className="visualGrid">{visuals.slice(0, 12).map((visual, index) => <article className="visualCard" key={`${index}-${visual.title ?? "dashboard"}`}><div className="visualCardHead"><div><span className="sectionTag">SIGNAL</span><h3>{visual.title ?? "Dataset signal"}</h3></div></div><Visual visual={visual} /></article>)}</section>
      </div>
    );
  }

  if (tab === "report") {
    return (
      <div className="artifactView">
        <section className="artifactHero reportHero"><div><span className="sectionTag">REPORT</span><h2>{result.report?.title ?? `${title} — Analysis Report`}</h2><p>Executive-ready evidence assembled from the completed Gamur investigation. The report view reuses the same analysis rather than rerunning the dataset.</p></div><div className="artifactActions"><button onClick={() => window.print()}>Print / Save PDF</button></div></section>
        <section className="properTableBlock"><div className="sectionHead"><div><span className="sectionTag">FINDINGS</span><h2>What the evidence says</h2></div></div>{result.insights ? <p className="reportText">{result.insights}</p> : <p className="reportText">Computed evidence is ready. Review the statistics, relationships and anomalies above to form the next decision.</p>}</section>
        <section className="properTableBlock"><div className="sectionHead"><div><span className="sectionTag">QUESTIONS</span><h2>Questions the dataset can answer</h2></div></div><div className="questionGrid">{(result.questions ?? []).map((q: any, index: number) => <button key={index} className="questionCard" onClick={() => onSelect(q)}><b>{q.question}</b><span>{q.answer}</span></button>)}</div></section>
      </div>
    );
  }

  return null;
}
