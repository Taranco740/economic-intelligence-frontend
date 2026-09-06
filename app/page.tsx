"use client";

import { useEffect, useState } from "react";
import { getBackendHealth } from "../lib/api";

type ConnectionState = "checking" | "connected" | "disconnected";

export default function Home() {
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [service, setService] = useState("Backend");

  useEffect(() => {
    getBackendHealth()
      .then((health) => {
        setService(health.service);
        setConnection("connected");
      })
      .catch(() => setConnection("disconnected"));
  }, []);

  const connectionLabel = {
    checking: "Checking backend…",
    connected: "Backend connected",
    disconnected: "Backend unavailable",
  }[connection];

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 24px" }}>
      <p style={{ marginBottom: 8, fontSize: 14 }}>Gamuur · Economic Intelligence</p>
      <h1 style={{ margin: "0 0 16px", fontSize: 42 }}>Turn raw data into decisions.</h1>
      <p style={{ maxWidth: 720, lineHeight: 1.6 }}>
        A connected workspace for data ingestion, quality checks, analysis, forecasting, AI insights, and reports.
      </p>

      <div
        style={{
          marginTop: 28,
          padding: "14px 18px",
          border: "1px solid #ddd",
          borderRadius: 12,
          display: "inline-flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <span aria-hidden="true">{connection === "connected" ? "●" : "○"}</span>
        <span>{connectionLabel}</span>
        {connection === "connected" && <small>· {service}</small>}
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 40 }}>
        <article><strong>Data</strong><p>Upload, profile, validate, and clean datasets.</p></article>
        <article><strong>Intelligence</strong><p>Analyze and forecast with traceable AI assistance.</p></article>
        <article><strong>Reports</strong><p>Turn approved results into professional outputs.</p></article>
      </section>
    </main>
  );
}
