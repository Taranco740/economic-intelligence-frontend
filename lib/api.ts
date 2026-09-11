const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api").replace(/\/$/, "");
export type BackendHealth = { status: string; service: string };
export type Project = { id: string; name: string; description: string | null; status: string };
export type Dataset = { id: string; project_id: string; name: string; source_type: string; description: string | null; current_version: number; created_at: string; updated_at: string };
export type IntelligenceResult = { stages: string[]; dataset: { rows: number; columns: number }; cleaning?: { changes: string[]; rows_after: number }; analysis?: { rows: number; columns: number; numeric_columns: string[]; summary: Array<{ column: string; count: number; mean: number; min: number; max: number; std: number }>; correlations: Record<string, Record<string, number | null>> }; forecasting?: { status: string; numeric_series: string[] }; insights?: string; visualization?: { charts: Array<{ type: string; title: string; xKey: string; yKey: string; data: Array<Record<string, number>> }> }; report?: { title: string; prompt: string; analysis: unknown; insights?: string } };
export type AnalystResult = { stages: string[]; dataset: { filename: string; sheet: string; rows: number; columns: number; quality_score: number; columns: unknown[] }; findings: { data_quality: unknown; cleaning: unknown; analysis: unknown; questions: string[]; visualization: unknown; forecasting: unknown; report: unknown }; insights: string; generated_at: string };
export type ChatResponse = { answer: string; language: "en" | "so" | "ar" };
type RequestOptions = RequestInit & { token?: string };
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers); headers.set("Accept", "application/json");
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, cache: "no-store" });
  if (!response.ok) { let detail=`Request failed (${response.status})`; try { const body=await response.json(); detail=body.detail?.message??body.detail??detail; } catch {} throw new Error(typeof detail==="string"?detail:JSON.stringify(detail)); }
  if (response.status===204) return undefined as T; return response.json() as Promise<T>;
}
export async function getBackendHealth(): Promise<BackendHealth> { return request<BackendHealth>("/health"); }
export async function getProjects(token: string): Promise<Project[]> { return request<Project[]>("/projects", { token }); }
export async function createProject(token: string, name: string): Promise<Project> { return request<Project>("/projects", { method:"POST", token, body:JSON.stringify({name,description:null,settings:{}}) }); }
export async function getDatasets(token: string, projectId: string): Promise<Dataset[]> { return request<Dataset[]>(`/projects/${projectId}/datasets`, { token }); }
export async function uploadDataset(token: string, projectId: string, name: string, file: File): Promise<Dataset> { const form=new FormData(); form.append("name",name); form.append("file",file); return request<Dataset>(`/projects/${projectId}/datasets`, {method:"POST",token,body:form}); }
export async function runIntelligence(token: string, projectId: string, datasetId: string, prompt: string, stages: string[]): Promise<IntelligenceResult> { return request<IntelligenceResult>(`/projects/${projectId}/intelligence/run`, {method:"POST",token,body:JSON.stringify({dataset_id:datasetId,prompt,stages})}); }
export async function runAnalyst(token: string, prompt: string, language: "en" | "so" | "ar", file: File): Promise<AnalystResult> { const form = new FormData(); form.append("prompt", prompt); form.append("language", language); form.append("file", file); return request<AnalystResult>("/analyst", { method:"POST", token, body:form }); }
export async function sendChat(token: string, message: string, language: "en" | "so" | "ar"): Promise<ChatResponse> { return request<ChatResponse>("/chat", {method:"POST",token,body:JSON.stringify({message,language})}); }
export { API_BASE_URL };
