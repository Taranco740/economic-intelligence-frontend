import type { ColumnProfile } from "./profiling";
import type { DataFact, Finding, IntelligenceIntent, IntelligenceResult, SourceRef } from "./types";

export type EngineRow = Record<string, unknown>;

export type EngineProfile = {
  filename: string;
  sheet?: string;
  rows: number;
  columns: number;
  quality_score: number;
  column_profiles: ColumnProfile[];
};

function ref(kind: SourceRef["kind"], value: string, label?: string): SourceRef { return { kind, ref: value, ...(label ? { label } : {}) }; }
function finding(id: string, type: Finding["type"], title: string, statement: string, source_refs: SourceRef[], importance: Finding["importance"] = "medium"): Finding { return { id, type, title, statement, importance, source_refs }; }

export function inferIntents(prompt: string): IntelligenceIntent[] {
  const p = prompt.toLowerCase();
  const intents: IntelligenceIntent[] = ["understand"];
  const add = (intent: IntelligenceIntent, tests: RegExp[]) => { if (tests.some((x) => x.test(p)) && !intents.includes(intent)) intents.push(intent); };
  add("clean", [/\bclean\b/, /\bfix\b/, /\borganize\b/, /\bformat\b/, /duplicate/]);
  add("analyze", [/analy[sz]e/, /insight/, /pattern/, /relationship/, /important/, /problem/]);
  add("statistics", [/statistic/, /mean/, /average/, /median/, /distribution/]);
  add("pivot", [/pivot/, /breakdown/, /group by/, /by category/]);
  add("visualize", [/chart/, /graph/, /visual/, /plot/, /dashboard/, /power bi/]);
  add("forecast", [/forecast/, /predict/, /projection/]);
  add("report", [/report/, /executive/]);
  add("presentation", [/power\s*point/, /pptx?/, /slides?/, /presentation/]);
  add("export_xlsx", [/excel/, /xlsx/, /download.*spreadsheet/]);
  add("export_pdf", [/pdf/]);
  add("export_pptx", [/power\s*point/, /pptx/, /slides?/]);
  return intents;
}

export function buildIntelligence(profile: EngineProfile, prompt: string, rows: EngineRow[], language: string): IntelligenceResult {
  const intents = inferIntents(prompt);
  const sources = [ref("dataset", profile.filename, profile.filename)];
  const facts: DataFact[] = [
    { id: "row_count", label: "Rows", value: profile.rows, source_refs: sources },
    { id: "column_count", label: "Columns", value: profile.columns, source_refs: sources },
    { id: "quality_score", label: "Data quality score", value: profile.quality_score, unit: "%", source_refs: [ref("calculation", "quality_score")] },
  ];
  const findings: Finding[] = [];
  const relationships: Finding[] = [];
  const anomalies: Finding[] = [];
  const missing = profile.column_profiles.reduce((sum, c) => sum + c.missing, 0);
  if (missing > 0) findings.push(finding("missing-values", "quality", "Missing values", `${missing.toLocaleString()} cells are missing across the dataset.`, [ref("calculation", "missing_cells")], "high"));
  const numeric = profile.column_profiles.filter((c) => c.type === "number");
  for (const c of numeric.slice(0, 8)) {
    if (c.mean !== undefined) facts.push({ id: `mean-${c.name}`, label: `Average ${c.name}`, value: Number(c.mean.toFixed(4)), source_refs: [ref("column", c.name, c.name), ref("calculation", `mean:${c.name}`)] });
  }
  for (const c of numeric.slice(0, 8)) {
    if (c.min !== undefined && c.max !== undefined) findings.push(finding(`range-${c.name}`, "insight", `${c.name} range`, `Values range from ${c.min} to ${c.max}.`, [ref("column", c.name, c.name), ref("calculation", `range:${c.name}`)], "medium"));
  }
  const text = profile.column_profiles.filter((c) => c.type === "text");
  for (const c of text.slice(0, 5)) {
    if (c.distinct > 1 && c.distinct <= Math.min(30, Math.max(2, profile.rows))) relationships.push(finding(`category-${c.name}`, "relationship", `${c.name} has ${c.distinct} distinct categories`, `This column can support grouped comparisons or pivots.`, [ref("column", c.name, c.name)], "low"));
  }
  const limitations: string[] = [];
  if (!rows.length) limitations.push("No data rows were available after header detection.");
  if (profile.rows > 50000) limitations.push("This analysis pass summarizes the dataset; very large datasets should use server-side aggregation for exhaustive analysis.");
  if (!numeric.length) limitations.push("No numeric columns were detected, so numeric statistics and trend calculations are limited.");
  const storySections = [
    { title: "What this data contains", body: `The dataset contains ${profile.rows.toLocaleString()} rows and ${profile.columns.toLocaleString()} columns. The measured data quality score is ${profile.quality_score}%.`, source_refs: sources },
    { title: "What stands out", body: findings.filter((x) => x.type !== "quality").slice(0, 4).map((x) => x.statement).join(" ") || "No additional high-confidence finding was identified from the deterministic pass.", source_refs: findings.flatMap((x) => x.source_refs).slice(0, 12) },
  ];
  return {
    version: "1.0",
    dataset: { filename: profile.filename, sheet: profile.sheet, rows: profile.rows, columns: profile.columns, quality_score: profile.quality_score },
    request: { prompt, intent: intents, language },
    facts, calculations: { missing_cells: missing, numeric_columns: numeric.map((c) => c.name), text_columns: text.map((c) => c.name) },
    findings, relationships, anomalies, limitations, source_refs: sources,
    story: { headline: "Your data, understood first", summary: storySections[0].body, sections: storySections },
    outputs: {
      statistics: intents.includes("statistics"), pivot: intents.includes("pivot"), visualization: intents.includes("visualize"),
      xlsx: intents.includes("export_xlsx"), pptx: intents.includes("presentation") || intents.includes("export_pptx"), pdf: intents.includes("export_pdf"),
    },
    ai: { provider: null, fallback_used: false, failures: [] },
  };
}
