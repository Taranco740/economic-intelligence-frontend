export type IntelligenceIntent = "understand" | "clean" | "analyze" | "statistics" | "pivot" | "visualize" | "forecast" | "report" | "presentation" | "export_xlsx" | "export_pdf" | "export_pptx";

export type SourceRef = {
  kind: "dataset" | "column" | "row_range" | "calculation" | "finding";
  ref: string;
  label?: string;
};

export type DataFact = {
  id: string;
  label: string;
  value: string | number | boolean | null;
  unit?: string;
  source_refs: SourceRef[];
};

export type Finding = {
  id: string;
  type: "insight" | "relationship" | "anomaly" | "quality" | "limitation";
  title: string;
  statement: string;
  importance?: "low" | "medium" | "high";
  source_refs: SourceRef[];
};

export type IntelligenceResult = {
  version: "1.0";
  dataset: {
    filename: string;
    sheet?: string;
    rows: number;
    columns: number;
    quality_score: number;
  };
  request: {
    prompt: string;
    intent: IntelligenceIntent[];
    language: string;
  };
  facts: DataFact[];
  calculations: Record<string, unknown>;
  findings: Finding[];
  relationships: Finding[];
  anomalies: Finding[];
  limitations: string[];
  source_refs: SourceRef[];
  story: {
    headline: string;
    summary: string;
    sections: Array<{ title: string; body: string; source_refs: SourceRef[] }>;
  };
  outputs: {
    statistics: boolean;
    pivot: boolean;
    visualization: boolean;
    xlsx: boolean;
    pptx: boolean;
    pdf: boolean;
  };
  ai: {
    provider: string | null;
    fallback_used: boolean;
    failures: string[];
  };
};
