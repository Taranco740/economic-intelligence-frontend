import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { generateAIText } from "../../../lib/ai-provider";
import { buildIntelligence, type EngineRow } from "../../../lib/intelligence/engine";
import type { ColumnProfile } from "../../../lib/intelligence/profiling";

export const runtime = "nodejs";
export const maxDuration = 60;

type Row = EngineRow;
function cleanName(value: unknown, index: number) { const raw = String(value ?? "").trim(); return raw || `column_${index + 1}`; }
function missing(v: unknown) { return v === null || v === undefined || (typeof v === "string" && v.trim() === ""); }
function numericValues(rows: Row[], key: string) { return rows.map((r) => typeof r[key] === "number" ? r[key] as number : Number(r[key])).filter((v): v is number => Number.isFinite(v)); }
function detectType(values: unknown[]): ColumnProfile["type"] { const present = values.filter((v) => !missing(v)); if (!present.length) return "empty"; if (present.every((v) => typeof v === "boolean")) return "boolean"; if (present.every((v) => typeof v === "number" && Number.isFinite(v))) return "number"; const dateLike = present.filter((v) => v instanceof Date || (typeof v === "string" && !Number.isNaN(Date.parse(v)))).length; return dateLike / present.length >= 0.85 ? "date" : "text"; }
function profileRows(rows: Row[], headers: string[]): ColumnProfile[] { return headers.map((name) => { const values = rows.map((r) => r[name]); const type = detectType(values); const present = values.filter((v) => !missing(v)); const out: ColumnProfile = { name, type, missing: values.length - present.length, distinct: new Set(present.map(String)).size, samples: present.slice(0, 5) }; if (type === "number") { const nums = numericValues(rows, name); if (nums.length) { out.min = Math.min(...nums); out.max = Math.max(...nums); out.mean = nums.reduce((a, b) => a + b, 0) / nums.length; } } return out; }); }
function qualityScore(rows: Row[], columns: ColumnProfile[]) { if (!rows.length) return 0; const missingRate = columns.reduce((s, c) => s + c.missing, 0) / (rows.length * Math.max(columns.length, 1)); const duplicates = rows.length - new Set(rows.map((row) => JSON.stringify(row))).size; return Math.max(0, Math.min(100, Math.round(100 - missingRate * 55 - (duplicates / rows.length) * 30))); }

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const prompt = String(form.get("prompt") || "Understand this dataset and tell me what matters.");
    const language = String(form.get("language") || "en");
    const provider = String(form.get("provider") || "").trim() || undefined;
    if (!(file instanceof File)) return NextResponse.json({ detail: "A CSV or Excel file is required." }, { status: 400 });
    if (file.size > 25 * 1024 * 1024) return NextResponse.json({ detail: "Files are limited to 25 MB for this analyst pass." }, { status: 413 });
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return NextResponse.json({ detail: "Only CSV and Excel files are supported in this version." }, { status: 400 });

    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, dense: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return NextResponse.json({ detail: "The workbook contains no sheets." }, { status: 400 });
    const raw = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
    if (!raw.length) return NextResponse.json({ detail: "The selected sheet is empty." }, { status: 400 });
    const headers = (raw[0] || []).map(cleanName);
    const rows: Row[] = raw.slice(1).map((line) => Object.fromEntries(headers.map((h, i) => [h, (line as unknown[])[i] ?? null]))).filter((r) => Object.values(r).some((v) => !missing(v)));
    const column_profiles = profileRows(rows, headers);
    const quality_score = qualityScore(rows, column_profiles);
    const intelligence = buildIntelligence({ filename: file.name, sheet: sheetName, rows: rows.length, columns: headers.length, quality_score, column_profiles }, prompt, rows, language);

    const ai = await generateAIText(language, prompt, { intelligence }, provider);
    const story = ai.text?.trim() || intelligence.story.summary;
    intelligence.ai = { provider: ai.provider, fallback_used: ai.fallback, failures: ai.failures };
    intelligence.story.summary = story;

    return NextResponse.json({
      ok: true,
      stages: ["understand", ...(intelligence.request.intent.filter((x) => x !== "understand").map((x) => x))],
      requested: intelligence.request.intent,
      dataset: { ...intelligence.dataset, columns: column_profiles },
      intelligence,
      story,
      insights: story,
      ai_provider: ai.provider,
      ai_fallback_used: ai.fallback,
      ai_provider_failures: ai.failures,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Gamur analyst error", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Gamur could not analyze the file." }, { status: 500 });
  }
}
