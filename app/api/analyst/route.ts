import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { generateAIText } from "../../../lib/ai-provider";

export const runtime = "nodejs";
export const maxDuration = 60;

type Row = Record<string, unknown>;
type ColumnProfile = { name: string; type: "number" | "date" | "boolean" | "text" | "empty"; missing: number; distinct: number; samples: unknown[]; min?: number; max?: number; mean?: number };

function cleanName(value: unknown, index: number) { const raw = String(value ?? "").trim(); return raw || `column_${index + 1}`; }
function isMissing(value: unknown) { return value === null || value === undefined || (typeof value === "string" && value.trim() === ""); }
function numericValues(rows: Row[], key: string) { return rows.map((r) => typeof r[key] === "number" ? r[key] as number : Number(r[key])).filter((v): v is number => Number.isFinite(v)); }
function detectType(values: unknown[]): ColumnProfile["type"] { const present = values.filter((v) => !isMissing(v)); if (!present.length) return "empty"; if (present.every((v) => typeof v === "boolean")) return "boolean"; if (present.every((v) => typeof v === "number" && Number.isFinite(v))) return "number"; const dateLike = present.filter((v) => v instanceof Date || (typeof v === "string" && !Number.isNaN(Date.parse(v)))).length; return dateLike / present.length >= 0.85 ? "date" : "text"; }
function profileRows(rows: Row[], headers: string[]): ColumnProfile[] { return headers.map((name) => { const values = rows.map((r) => r[name]); const type = detectType(values); const present = values.filter((v) => !isMissing(v)); const out: ColumnProfile = { name, type, missing: values.length - present.length, distinct: new Set(present.map((v) => String(v))).size, samples: present.slice(0, 5) }; if (type === "number") { const nums = numericValues(rows, name); if (nums.length) { out.min = Math.min(...nums); out.max = Math.max(...nums); out.mean = nums.reduce((a, b) => a + b, 0) / nums.length; } } return out; }); }
function qualityScore(rows: Row[], columns: ColumnProfile[]) { if (!rows.length) return 0; const missingRate = columns.reduce((s, c) => s + c.missing, 0) / (rows.length * Math.max(columns.length, 1)); const duplicates = rows.length - new Set(rows.map((row) => JSON.stringify(row))).size; return Math.max(0, Math.min(100, Math.round(100 - missingRate * 55 - (duplicates / rows.length) * 30))); }
function wants(prompt: string, patterns: RegExp[]) { return patterns.some((p) => p.test(prompt)); }
function buildCharts(rows: Row[], columns: ColumnProfile[]) { const date = columns.find((c) => c.type === "date"); const nums = columns.filter((c) => c.type === "number").slice(0, 3); const charts: Array<Record<string, unknown>> = []; if (date && nums.length) { const sorted = [...rows].filter((r) => !isMissing(r[date.name])).sort((a, b) => new Date(String(a[date.name])).getTime() - new Date(String(b[date.name])).getTime()).slice(-60); charts.push({ type: "line", title: `${nums[0].name} over time`, xKey: date.name, yKey: nums[0].name, data: sorted.map((r) => ({ [date.name]: r[date.name], [nums[0].name]: r[nums[0].name] })) }); } if (nums.length) charts.push({ type: "bar", title: `Distribution of ${nums[0].name}`, xKey: nums[0].name, yKey: "count", data: nums[0].samples.map((v) => ({ [nums[0].name]: v, count: 1 })) }); return charts; }
function forecast(rows: Row[], columns: ColumnProfile[]) { const date = columns.find((c) => c.type === "date"); const target = columns.find((c) => c.type === "number"); if (!date || !target) return { status: "insufficient_data", reason: "A usable date/time column and numeric target were not both detected." }; const points = rows.map((r) => ({ x: new Date(String(r[date.name])).getTime(), y: Number(r[target.name]) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x); if (points.length < 12) return { status: "insufficient_data", reason: "At least 12 usable time-series observations are recommended." }; const n = points.length, meanX = points.reduce((s, p) => s + p.x, 0) / n, meanY = points.reduce((s, p) => s + p.y, 0) / n; const denom = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0); const slope = denom ? points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0) / denom : 0; const intercept = meanY - slope * meanX; const last = points[n - 1]; const step = Math.max(86400000, points[n - 1].x - points[n - 2].x); return { status: "completed", method: "trend_baseline", target: target.name, time: date.name, forecast: Array.from({ length: 6 }, (_, i) => { const x = last.x + step * (i + 1); return { period: new Date(x).toISOString(), predicted: intercept + slope * x }; }), warning: "Baseline trend only; seasonality and external drivers require a richer model." }; }

export async function POST(request: Request) {
  try {
    const form = await request.formData(); const file = form.get("file"); const prompt = String(form.get("prompt") || "Understand this dataset."); const language = String(form.get("language") || "en");
    if (!(file instanceof File)) return NextResponse.json({ detail: "A CSV or Excel file is required." }, { status: 400 });
    if (file.size > 25 * 1024 * 1024) return NextResponse.json({ detail: "Files are limited to 25 MB for this analyst pass." }, { status: 413 });
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return NextResponse.json({ detail: "Only CSV and Excel files are supported in this version." }, { status: 400 });
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, dense: true }); const sheetName = workbook.SheetNames[0]; if (!sheetName) return NextResponse.json({ detail: "The workbook contains no sheets." }, { status: 400 });
    const raw = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true }); if (!raw.length) return NextResponse.json({ detail: "The selected sheet is empty." }, { status: 400 });
    const headers = (raw[0] || []).map(cleanName); const rows: Row[] = raw.slice(1).map((line) => Object.fromEntries(headers.map((h, i) => [h, (line as unknown[])[i] ?? null]))).filter((r) => Object.values(r).some((v) => !isMissing(v)));
    const columns = profileRows(rows, headers); const quality = qualityScore(rows, columns); const duplicates = rows.length - new Set(rows.map((row) => JSON.stringify(row))).size;
    const doClean = wants(prompt, [/\bclean\b/i, /\borganize\b/i, /\bfix\b/i, /\bformat\b/i, /\bremove duplicates?\b/i]);
    const doAnalyze = wants(prompt, [/\banaly[sz]e\b/i, /\binsight/i, /\btrend/i, /\bproblem/i, /\bpattern/i, /\bstatistics?\b/i, /\bwhat does/i, /\bwhat.*important/i]);
    const doVisualize = wants(prompt, [/\bchart/i, /\bgraph/i, /\bvisual/i, /\bplot/i, /\bp(i|ie)\s*chart/i, /\bdashboard/i, /\bpower\s*bi/i]);
    const doForecast = wants(prompt, [/\bforecast/i, /\bpredict/i, /\bprojection/i]);
    const doReport = wants(prompt, [/\breport/i, /\bmanagement report/i, /\bexecutive/i]);
    const doPresentation = wants(prompt, [/\bpower\s*point\b/i, /\bpptx?\b/i, /\bslides?\b/i, /\bpresentation/i]);
    const requested = { clean: doClean, analyze: doAnalyze, visualize: doVisualize, forecast: doForecast, report: doReport, presentation: doPresentation };
    const findings: Record<string, unknown> = { requested, data_quality: { score: quality, missing_cells: columns.reduce((s, c) => s + c.missing, 0), duplicate_rows: duplicates }, analysis: { numeric_columns: columns.filter((c) => c.type === "number").map((c) => ({ name: c.name, mean: c.mean, min: c.min, max: c.max })), date_columns: columns.filter((c) => c.type === "date").map((c) => c.name), categorical_columns: columns.filter((c) => c.type === "text").map((c) => ({ name: c.name, distinct: c.distinct })) } };
    if (doClean) findings.cleaning = { recommended: columns.filter((c) => c.missing > 0).map((c) => `Review missing values in ${c.name}`), duplicate_rows: duplicates, output: "cleaned workbook generation requested" };
    if (doVisualize) findings.visualization = { charts: buildCharts(rows, columns), requested_formats: ["charts"] };
    if (doForecast) findings.forecasting = forecast(rows, columns);
    if (doReport) findings.report = { sections: ["Executive Summary", "Dataset Overview", "Data Quality", "Key Findings", "Trends", "Recommendations", "Limitations"] };
    if (doPresentation) findings.presentation = { requested: true, output_format: "pptx", language, note: "Slide generation will use verified analytical results; no generated photographic images." };
    const profile = { filename: file.name, sheet: sheetName, rows: rows.length, columns: headers.length, quality_score: quality, columns };
    const ai = await generateAIText(language, prompt, { profile, findings }); const stages = ["understand", ...(doClean ? ["clean"] : []), ...(doAnalyze ? ["analyze", "discover"] : []), ...(doVisualize ? ["visualize"] : []), ...(doForecast ? ["forecast"] : []), ...(doReport || doPresentation ? ["report"] : [])];
    return NextResponse.json({ stages, requested, dataset: profile, findings, insights: ai.text || "Gamuur completed the requested data step only. Ask for another output whenever you want it.", ai_provider: ai.provider, ai_fallback_used: ai.fallback, ai_provider_failures: ai.failures, generated_at: new Date().toISOString() });
  } catch (error) { return NextResponse.json({ detail: error instanceof Error ? error.message : "Gamuur could not analyze the file." }, { status: 500 }); }
}
