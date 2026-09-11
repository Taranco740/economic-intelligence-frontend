import * as XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
import type { ForecastResult, IntelligenceResult } from "./api";

type Visual = {
  type?: string;
  title?: string;
  xKey?: string;
  yKey?: string;
  data?: Array<Record<string, any>>;
  r?: number;
  category?: string;
  columns?: string[];
  matrix?: Array<Array<number | null>>;
  min?: number;
  q1?: number;
  median?: number;
  q3?: number;
  max?: number;
  outlierCount?: number;
};

const ink = "16211D";
const navy = "173A5E";
const cyan = "16B8C4";
const violet = "7657D9";
const orange = "F59E0B";
const green = "16A36A";
const pale = "F4F7FA";
const white = "FFFFFF";
const palette = ["16B8C4", "7657D9", "F59E0B", "16A36A", "E45757", "3B82F6"];

const safeName = (name: string) => (name || "gamur").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "gamur";

function tableSheet(wb: XLSX.WorkBook, name: string, rows: any[][], widths?: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  if (rows.length && rows[0]?.length) {
    const ref = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
    ws["!autofilter"] = { ref: XLSX.utils.encode_range(ref) };
    ws["!cols"] = (widths || rows[0].map((_: any, i: number) => {
      const longest = Math.max(...rows.slice(0, 80).map((r) => String(r?.[i] ?? "").length), 10);
      return Math.min(40, longest + 2);
    })).map((wch) => ({ wch }));
    for (let c = ref.s.c; c <= ref.e.c; c += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { font: { bold: true, color: white, sz: 11 }, fill: { fgColor: { rgb: navy } }, alignment: { vertical: "center" } };
    }
    for (let r = 1; r <= ref.e.r; r += 1) {
      for (let c = 0; c <= ref.e.c; c += 1) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell) cell.s = { fill: { fgColor: { rgb: r % 2 ? white : pale } }, alignment: { vertical: "center" } };
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

export function downloadStatisticsWorkbook(name: string, result: IntelligenceResult) {
  const a = result.analysis ?? ({} as any);
  const stats = a.summary ?? [];
  const categories = a.categorical_summary ?? [];
  const relationships = a.relationships ?? result.visualization?.relationships ?? [];
  const outliers = a.outliers ?? [];
  const visuals = (result.visualization?.visuals ?? result.visualization?.charts ?? []) as Visual[];
  const wb = XLSX.utils.book_new();

  tableSheet(wb, "Read Me", [
    ["GAMUR · VISUALIZE + STATISTICS"],
    ["Dataset", name],
    ["Purpose", "Interactive, filterable analytical workbook. Numbers are primary; visuals support interpretation."],
    ["Rows after cleaning", result.cleaning?.rows_after ?? a.rows ?? 0],
    ["Fields", a.columns ?? 0],
    ["Target", a.target ?? "—"],
    ["How to use", "Use the filter arrows on analytical tables, inspect relationships, and review the visual evidence data sheets."],
  ]);

  tableSheet(wb, "Descriptive Statistics", [
    ["Variable", "N", "Missing", "Unique", "Mean", "Median", "Std Dev", "Variance", "Min", "Q1", "Q3", "Max", "Range", "IQR", "P05", "P10", "P90", "P95"],
    ...stats.map((s: any) => [s.column, s.count, s.missing ?? 0, s.unique ?? 0, s.mean, s.median, s.std, s.variance, s.min, s.q1, s.q3, s.max, s.range, s.iqr, s.p05, s.p10, s.p90, s.p95]),
  ]);

  tableSheet(wb, "Pivot Analysis", [
    ["Variable", "Mean", "Median", "Min", "Max", "Std Dev", "Outlier Count", "Outlier Rate"],
    ...stats.map((s: any) => {
      const o = outliers.find((x: any) => x.column === s.column);
      return [s.column, s.mean, s.median, s.min, s.max, s.std, o?.count ?? 0, o?.rate ?? 0];
    }),
  ]);

  tableSheet(wb, "Categories", [
    ["Field", "Value", "Count", "Share"],
    ...categories.flatMap((c: any) => (c.top_values ?? []).map((v: any) => [c.column, v.value, v.count, v.share])),
  ]);

  tableSheet(wb, "Correlations", [
    ["Variable A", "Variable B", "Correlation", "Strength"],
    ...relationships.map((r: any) => [r.x, r.y, r.r, r.strength]),
  ]);

  tableSheet(wb, "Outliers", [
    ["Variable", "Flagged Rows", "Rate", "Lower Bound", "Upper Bound"],
    ...outliers.map((o: any) => [o.column, o.count, o.rate, o.lower, o.upper]),
  ]);

  tableSheet(wb, "Data Quality", [
    ["Metric", "Value"],
    ["Rows before cleaning", result.dataset?.rows ?? a.rows ?? 0],
    ["Rows after cleaning", result.cleaning?.rows_after ?? a.rows ?? 0],
    ["Cleaning actions", result.cleaning?.changes?.length ?? 0],
    ["Numeric fields", (a.numeric_columns ?? []).length],
    ["Categorical fields", (a.categorical_columns ?? []).length],
    ["Date fields", (a.date_columns ?? []).length],
    ...((result.cleaning?.changes ?? []).map((x) => ["Cleaning action", x])),
  ]);

  tableSheet(wb, "Visual Evidence", [
    ["Visual #", "Type", "Title", "Category", "X", "Y", "Correlation"],
    ...visuals.map((v, i) => [i + 1, v.type ?? "visual", v.title ?? "", v.category ?? "", v.xKey ?? "", v.yKey ?? "", v.r ?? ""]),
  ]);

  visuals.forEach((v, i) => {
    if (!v.data?.length) return;
    const keys = Array.from(new Set(v.data.flatMap((r) => Object.keys(r))));
    tableSheet(wb, `Chart ${i + 1}`, [keys, ...v.data.map((r) => keys.map((k) => r[k]))]);
  });

  XLSX.writeFile(wb, `${safeName(name)}-visualize-statistics.xlsx`, { compression: true });
}

export function downloadForecastWorkbook(name: string, f: ForecastResult) {
  const wb = XLSX.utils.book_new();
  tableSheet(wb, "Forecast", [["Date", "Forecast", "Lower 95%", "Upper 95%"], ...f.forecast.map((x) => [x.date, x.forecast, x.lower, x.upper])]);
  tableSheet(wb, "Historical", [["Date", "Actual"], ...f.historical.map((x) => [x.date, x.actual])]);
  tableSheet(wb, "Accuracy", [["Metric", "Value"], ["Method", f.method], ["Backtest RMSE", f.backtest_rmse], ["Residual Std Dev", f.residual_std], ["Frequency", f.frequency], ["Horizon", `${f.horizon_years} year(s)`]]);
  tableSheet(wb, "Assumptions", [["Item", "Value"], ["Target", f.target], ["Date field", f.date_column], ["Forecast horizon", `${f.horizon_years} year(s)`], ["Caution", f.caution]]);
  XLSX.writeFile(wb, `${safeName(name)}-forecast-${f.horizon_years}y.xlsx`, { compression: true });
}

function pdfHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(23, 58, 94);
  doc.rect(0, 0, 210, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text("GAMUR", 14, 14);
  doc.setFontSize(12);
  doc.text(title, 14, 23);
  doc.setFontSize(8);
  doc.text(subtitle.slice(0, 100), 14, 29);
  doc.setTextColor(22, 33, 29);
}

function pdfFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(110, 120, 125);
    doc.text(`Gamur · page ${p} of ${pages}`, 14, 290);
  }
}

function addWrapped(doc: jsPDF, text: string, x: number, y: number, width: number, size = 9) {
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(String(text || ""), width);
  doc.text(lines, x, y);
  return y + lines.length * (size * 0.48 + 2);
}

function pdfKpis(doc: jsPDF, items: Array<[string, string]>, y: number) {
  const w = 43;
  items.forEach(([label, value], i) => {
    const x = 14 + i * 46;
    doc.setFillColor(244, 247, 250);
    doc.roundedRect(x, y, w, 25, 2, 2, "F");
    doc.setTextColor(90, 105, 115);
    doc.setFontSize(7);
    doc.text(label.toUpperCase(), x + 4, y + 7);
    doc.setTextColor(22, 33, 29);
    doc.setFontSize(13);
    doc.text(String(value).slice(0, 18), x + 4, y + 18);
  });
}

function addSimpleBarChart(doc: jsPDF, visual: Visual, x: number, y: number, width: number) {
  const data = (visual.data ?? []).slice(0, 10);
  if (!data.length) return y;
  const yKey = visual.yKey ?? "y";
  const xKey = visual.xKey ?? "x";
  const max = Math.max(1, ...data.map((r) => Number(r[yKey]) || 0));
  doc.setFontSize(8); doc.setTextColor(22, 33, 29); doc.text((visual.title ?? "Bar chart").slice(0, 75), x, y); y += 6;
  data.forEach((r, i) => {
    const yy = y + i * 9;
    const label = String(r[xKey] ?? "").slice(0, 16);
    const bar = Math.max(1, width * (Number(r[yKey]) || 0) / max);
    doc.setFontSize(6); doc.text(label, x, yy + 3);
    doc.setFillColor(...hexRgb(palette[i % palette.length])); doc.roundedRect(x + 32, yy, bar, 5, 1, 1, "F");
    doc.setTextColor(70, 80, 85); doc.text(String(r[yKey]), x + 35 + bar, yy + 4);
    doc.setTextColor(22, 33, 29);
  });
  return y + data.length * 9 + 5;
}

function hexRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

export function downloadStatisticsPdf(name: string, result: IntelligenceResult) {
  const a = result.analysis ?? ({} as any); const stats = a.summary ?? []; const rel = a.relationships ?? []; const visuals = (result.visualization?.visuals ?? result.visualization?.charts ?? []) as Visual[];
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  pdfHeader(doc, "Visualize + Statistics", name);
  pdfKpis(doc, [["Rows", String(a.rows ?? 0)], ["Fields", String(a.columns ?? 0)], ["Numeric", String((a.numeric_columns ?? []).length)], ["Outliers", String((a.outliers ?? []).reduce((n: number, o: any) => n + o.count, 0))]], 42);
  let y = 78;
  doc.setFontSize(13); doc.text("Descriptive statistics", 14, y); y += 7;
  doc.setFontSize(7);
  const headers = ["Variable", "N", "Mean", "Median", "Std", "Min", "Q1", "Q3", "Max"];
  headers.forEach((h, i) => doc.text(h, 14 + i * 21, y)); y += 5;
  stats.slice(0, 24).forEach((s: any, row: number) => { if (y > 270) { doc.addPage(); y = 20; } if (row % 2 === 0) { doc.setFillColor(244,247,250); doc.rect(12,y-4,184,6,"F"); } [s.column,s.count,s.mean,s.median,s.std,s.min,s.q1,s.q3,s.max].forEach((v,i)=>doc.text(String(typeof v === "number" ? v.toFixed(2) : v).slice(0,16),14+i*21,y)); y += 6; });
  if (rel.length) { if (y > 250) { doc.addPage(); y = 20; } y += 6; doc.setFontSize(13); doc.text("Strongest relationships",14,y); y += 7; doc.setFontSize(8); rel.slice(0,8).forEach((r:any)=>{doc.text(`${r.x} ↔ ${r.y}`,14,y);doc.text(`r = ${Number(r.r).toFixed(3)} · ${r.strength}`,110,y);y+=6;}); }
  for (const v of visuals.slice(0, 5)) { if (y > 235) { doc.addPage(); y = 20; } if (v.type === "bar" || v.type === "histogram") y = addSimpleBarChart(doc,v,14,y,120); }
  pdfFooter(doc); doc.save(`${safeName(name)}-visualize-statistics.pdf`);
}

export function downloadReportPdf(name: string, result: IntelligenceResult) {
  const a = result.analysis ?? ({} as any); const doc = new jsPDF({ unit: "mm", format: "a4" });
  pdfHeader(doc, result.report?.title ?? "Analysis Report", name);
  pdfKpis(doc, [["Rows", String(a.rows ?? 0)], ["Fields", String(a.columns ?? 0)], ["Relationships", String((a.relationships ?? []).length)], ["Outlier flags", String((a.outliers ?? []).reduce((n:number,o:any)=>n+o.count,0))]], 42);
  let y = 78;
  doc.setFontSize(13); doc.text("Executive findings",14,y); y += 7; y = addWrapped(doc, result.insights || "Computed evidence is ready for review.", 14, y, 180, 9) + 6;
  doc.setFontSize(13); doc.text("Key questions",14,y); y += 7;
  (result.questions ?? []).slice(0, 10).forEach((q:any,i:number)=>{ if(y>268){doc.addPage();y=20;} doc.setFontSize(9); doc.setFont(undefined,"bold"); y=addWrapped(doc, `${i+1}. ${q.question}`,14,y,180,9); doc.setFont(undefined,"normal"); y=addWrapped(doc,q.answer,18,y,176,8)+4; });
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFontSize(13); doc.text("Relationships",14,y); y += 7; (a.relationships ?? []).slice(0,12).forEach((r:any)=>{doc.setFontSize(8);doc.text(`${r.x} ↔ ${r.y}`,14,y);doc.text(`r ${Number(r.r).toFixed(3)} · ${r.strength}`,115,y);y+=5;});
  pdfFooter(doc); doc.save(`${safeName(name)}-report.pdf`);
}

export function downloadAnalyticsPdf(name: string, result: IntelligenceResult) {
  downloadReportPdf(name, result);
}

export function downloadForecastPdf(name: string, f: ForecastResult) {
  const doc = new jsPDF({ unit: "mm", format: "a4" }); pdfHeader(doc, `Forecast · ${f.horizon_years} year(s)`, name);
  pdfKpis(doc, [["Target", f.target], ["Method", f.method], ["RMSE", String(f.backtest_rmse)], ["Frequency", f.frequency]], 42);
  let y=78; doc.setFontSize(12); doc.text("Forecast",14,y); y+=7; doc.setFontSize(7); ["Date","Forecast","Lower 95%","Upper 95%"].forEach((h,i)=>doc.text(h,14+i*42,y));y+=5;
  f.forecast.slice(0,36).forEach((r,i)=>{if(y>270){doc.addPage();y=20;}[r.date,r.forecast,r.lower,r.upper].forEach((v,j)=>doc.text(String(v),14+j*42,y));y+=5;});
  y+=6;doc.setFontSize(10);doc.text("Caution",14,y);y+=6;addWrapped(doc,f.caution,14,y,180,8);pdfFooter(doc);doc.save(`${safeName(name)}-forecast-${f.horizon_years}y.pdf`);
}

function escapeHtml(value: any) { return String(value ?? "").replace(/[&<>\"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c] as string)); }
function jsData(value: any) { return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"); }

export function downloadInteractiveDashboard(name: string, result: IntelligenceResult) {
  const a = result.analysis ?? ({} as any); const visuals = (result.visualization?.visuals ?? result.visualization?.charts ?? []) as Visual[];
  const payload = visuals.filter((v) => v.data?.length).map((v, i) => ({ ...v, id: i }));
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(name)} · Gamur Dashboard</title><style>
  body{margin:0;background:#f5f7fa;color:#16211d;font:14px Inter,Arial,sans-serif}header{background:linear-gradient(135deg,#173a5e,#7657d9);color:white;padding:28px 32px}h1{margin:0 0 6px;font-size:28px}.sub{opacity:.8}.wrap{max-width:1300px;margin:auto;padding:24px}.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}.filters button{border:0;border-radius:999px;padding:9px 14px;background:white;box-shadow:0 2px 10px #0001;cursor:pointer}.filters button.active{background:#16b8c4;color:white}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi{background:white;border-radius:16px;padding:18px;box-shadow:0 4px 20px #0000000d}.kpi small{display:block;color:#68757b}.kpi b{font-size:25px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:18px}.card{background:white;border-radius:18px;padding:18px;box-shadow:0 4px 20px #0000000d}.card h3{margin:0 0 12px}.chart{width:100%;height:260px}.bar{height:12px;border-radius:8px;background:linear-gradient(90deg,#16b8c4,#7657d9)}@media(max-width:850px){.kpis,.grid{grid-template-columns:1fr}}</style></head><body><header><div class="sub">GAMUR · INTERACTIVE DASHBOARD</div><h1>${escapeHtml(name)}</h1><div class="sub">Downloadable dashboard · filter the evidence locally in your browser</div></header><main class="wrap"><div class="filters"><button class="active" data-filter="all">All</button><button data-filter="trend">Trends</button><button data-filter="distribution">Distributions</button><button data-filter="relationship">Relationships</button><button data-filter="comparison">Comparisons</button></div><section class="kpis"><div class="kpi"><small>ROWS</small><b>${Number(a.rows??0).toLocaleString()}</b></div><div class="kpi"><small>FIELDS</small><b>${a.columns??0}</b></div><div class="kpi"><small>RELATIONSHIPS</small><b>${(a.relationships??[]).length}</b></div><div class="kpi"><small>OUTLIER FLAGS</small><b>${(a.outliers??[]).reduce((n:number,o:any)=>n+o.count,0)}</b></div></section><section id="grid" class="grid"></section></main><script>const data=${jsData(payload)};const grid=document.getElementById('grid');function esc(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}function render(filter){grid.innerHTML='';data.filter(v=>filter==='all'||v.category===filter).forEach(v=>{const c=document.createElement('article');c.className='card';c.innerHTML='<h3>'+esc(v.title)+'</h3><div class="sub">'+esc(v.type)+' · '+esc(v.xKey||'')+(v.yKey?' × '+esc(v.yKey):'')+'</div>';const d=v.data||[];if(v.type==='bar'||v.type==='histogram'){const max=Math.max(1,...d.map(r=>Number(r[v.yKey])||0));c.innerHTML+='<div style="margin-top:14px">'+d.slice(0,14).map(r=>'<div style="display:grid;grid-template-columns:130px 1fr 55px;gap:8px;align-items:center;margin:7px 0"><span>'+esc(r[v.xKey])+'</span><span class="bar" style="width:'+Math.max(2,Math.round(100*(Number(r[v.yKey])||0)/max))+'%"></span><b>'+esc(r[v.yKey])+'</b></div>').join('')+'</div>'}else if(v.type==='scatter'){c.innerHTML+='<div style="height:220px;display:flex;align-items:center;justify-content:center"><b>Scatter evidence · r = '+Number(v.r||0).toFixed(3)+'</b></div>'}else{c.innerHTML+='<div style="height:220px;display:flex;align-items:center;justify-content:center"><b>Trend evidence · '+d.length+' points</b></div>'}grid.appendChild(c)})}document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');render(b.dataset.filter)}));render('all');</script></body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" }); const url = URL.createObjectURL(blob); const aEl = document.createElement("a"); aEl.href = url; aEl.download = `${safeName(name)}-interactive-dashboard.html`; aEl.click(); URL.revokeObjectURL(url);
}
