const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

export type BackendHealth = {
  status: string;
  service: string;
};

export async function getBackendHealth(): Promise<BackendHealth> {
  const response = await fetch(`${API_BASE_URL}/health`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Backend health check failed (${response.status})`);
  }

  return response.json() as Promise<BackendHealth>;
}

export { API_BASE_URL };
