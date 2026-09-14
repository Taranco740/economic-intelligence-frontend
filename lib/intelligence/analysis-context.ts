import type { EngineRow } from "./engine";

export type NumericSummary = {
  column: string;
  count: number;
  mean: number;
  median: number;
  std_dev: number;
  min: number;
  max: number;
  outliers: number;
  outlier_rate_pct: number;
  skew_signal: "meaningful" | "mild" | "none";
};

export type CorrelationSummary = {
  column_a: string;
  column_b: string;
  r: number;
  strength: "strong" | "moderate" | "weak";
  direction: "positive" | "negative";
};

export type CategorySummary = {
  column: string;
  distinct: number;
  categories: Array<{ value: string; count: number; pct: number }>;
  largest_share_pct: number;
  largest_category: string | null;
  imbalance_signal: "high" | "moderate" | "low";
};

export type AnalysisContext = {
  dataset_scope: {
    row_count: number;
    column_count: number;
    date_columns: Array<{ column: string; min: string; max: string }>;
    subject_clues: Array<{ column: string; sample_values: string[] }>;
  };
  numeric_statistics: NumericSummary[];
  correlations: CorrelationSummary[];
  categorical_breakdowns: CategorySummary[];
  priority_findings: string[];
};

function finiteNumbers(rows: EngineRow[], column: string): number[] {
  return rows.map((row) => {
    const value = row[column];
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "") return Number(value.replace(/,/g, ""));
    return NaN;
  }).filter(Number.isFinite);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function outlierCount(values: number[]): number {
  if (values.length < 4) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = median(sorted.slice(0, Math.floor(sorted.length / 2)));
  const upperStart = Math.ceil(sorted.length / 2);
  const q3 = median(sorted.slice(upperStart));
  const iqr = q3 - q1;
  if (!Number.isFinite(iqr) || iqr === 0) return 0;
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  return values.filter((value) => value < low || value > high).length;
}

function correlation(a: number[], b: number[]): number | null {
  const pairs: Array<[number, number]> = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) if (Number.isFinite(a[i]) && Number.isFinite(b[i])) pairs.push([a[i], b[i]]);
  if (pairs.length < 3) return null;
  const meanA = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
  const meanB = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanA;
    const dy = y - meanB;
    numerator += dx * dy;
    denomA += dx * dx;
    denomB += dy * dy;
  }
  if (denomA === 0 || denomB === 0) return null;
  return numerator / Math.sqrt(denomA * denomB);
}

function strength(r: number): CorrelationSummary["strength"] {
  const abs = Math.abs(r);
  return abs >= 0.7 ? "strong" : abs >= 0.4 ? "moderate" : "weak";
}

function dateRange(rows: EngineRow[], column: string): { min: string; max: string } | null {
  const dates = rows.map((row) => {
    const value = row[column];
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
  }).filter((value): value is Date => value !== null);
  if (!dates.length) return null;
  dates.sort((a, b) => a.getTime() - b.getTime());
  return { min: dates[0].toISOString().slice(0, 10), max: dates[dates.length - 1].toISOString().slice(0, 10) };
}

export function buildAnalysisContext(rows: EngineRow[], columnProfiles: Array<{ name: string; type: string; distinct: number; samples: unknown[] }>): AnalysisContext {
  const numericColumns = columnProfiles.filter((column) => column.type === "number").map((column) => column.name);
  const textColumns = columnProfiles.filter((column) => column.type === "text");
  const dateColumns = columnProfiles.filter((column) => column.type === "date").map((column) => {
    const range = dateRange(rows, column.name);
    return range ? { column: column.name, ...range } : null;
  }).filter((value): value is { column: string; min: string; max: string } => value !== null);

  const numeric_statistics: NumericSummary[] = numericColumns.map((column) => {
    const values = finiteNumbers(rows, column);
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const med = values.length ? median(values) : 0;
    const gap = Math.abs(mean - med) / Math.max(Math.abs(med), Math.abs(mean), 1);
    const outliers = outlierCount(values);
    return {
      column,
      count: values.length,
      mean,
      median: med,
      std_dev: stdDev(values, mean),
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
      outliers,
      outlier_rate_pct: values.length ? (outliers / values.length) * 100 : 0,
      skew_signal: gap >= 0.2 ? "meaningful" : gap >= 0.1 ? "mild" : "none",
    };
  });

  const correlations: CorrelationSummary[] = [];
  for (let i = 0; i < numericColumns.length; i += 1) {
    for (let j = i + 1; j < numericColumns.length; j += 1) {
      const a = finiteNumbers(rows, numericColumns[i]);
      const b = finiteNumbers(rows, numericColumns[j]);
      const r = correlation(a, b);
      if (r !== null && Math.abs(r) >= 0.4) correlations.push({ column_a: numericColumns[i], column_b: numericColumns[j], r, strength: strength(r), direction: r >= 0 ? "positive" : "negative" });
    }
  }
  correlations.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  const categorical_breakdowns: CategorySummary[] = textColumns.filter((column) => column.distinct > 0 && column.distinct <= 100).map((column) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const value = row[column.name];
      if (value === null || value === undefined || String(value).trim() === "") continue;
      const key = String(value).trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
    const categories = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([value, count]) => ({ value, count, pct: total ? (count / total) * 100 : 0 }));
    const largest = categories[0];
    const largestShare = largest && total ? (largest.count / total) * 100 : 0;
    return { column: column.name, distinct: counts.size, categories, largest_share_pct: largestShare, largest_category: largest?.value || null, imbalance_signal: largestShare >= 70 ? "high" : largestShare >= 50 ? "moderate" : "low" };
  }).filter((column) => column.categories.length > 0);

  const priority_findings: string[] = [];
  for (const stat of numeric_statistics.filter((item) => item.skew_signal === "meaningful").slice(0, 5)) priority_findings.push(`${stat.column}: mean ${stat.mean.toFixed(2)} vs median ${stat.median.toFixed(2)}; meaningful mean-median gap suggests skew.`);
  for (const item of correlations.slice(0, 8)) priority_findings.push(`${item.column_a} and ${item.column_b}: ${item.strength} ${item.direction} correlation, r=${item.r.toFixed(2)}.`);
  for (const stat of numeric_statistics.filter((item) => item.outlier_rate_pct > 2).sort((a, b) => b.outlier_rate_pct - a.outlier_rate_pct).slice(0, 8)) priority_findings.push(`${stat.column}: ${stat.outliers} outliers (${stat.outlier_rate_pct.toFixed(1)}%), above the 2% review threshold.`);
  for (const item of categorical_breakdowns.filter((item) => item.imbalance_signal !== "low").sort((a, b) => b.largest_share_pct - a.largest_share_pct).slice(0, 5)) priority_findings.push(`${item.column}: ${item.largest_category} is the largest category at ${item.largest_share_pct.toFixed(1)}%, indicating ${item.imbalance_signal} imbalance.`);

  const subject_clues = textColumns.slice(0, 8).map((column) => ({ column: column.name, sample_values: column.samples.map(String).filter(Boolean).slice(0, 8) }));
  return { dataset_scope: { row_count: rows.length, column_count: columnProfiles.length, date_columns: dateColumns, subject_clues }, numeric_statistics, correlations, categorical_breakdowns, priority_findings };
}

export function fallbackAnalysisStory(context: AnalysisContext, prompt: string): string {
  const p = prompt.toLowerCase();
  if (/what is this data about|what does this data|describe this data|subject/.test(p)) {
    const clues = context.dataset_scope.subject_clues.filter((item) => item.sample_values.length).slice(0, 4).map((item) => `${item.column}: ${item.sample_values.join(", ")}`).join("; ");
    const dates = context.dataset_scope.date_columns[0];
    return `This appears to be data about ${clues || "a structured business dataset"}${dates ? `, covering ${dates.min} to ${dates.max}` : ""}.`;
  }
  if (context.priority_findings.length) return context.priority_findings.slice(0, 6).join(" ");
  return "The computed pass did not find a strong skew, correlation, outlier rate above 2%, or major categorical imbalance to highlight.";
}
