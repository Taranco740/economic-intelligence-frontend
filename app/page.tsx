export default function Home() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 24px" }}>
      <p style={{ marginBottom: 8, fontSize: 14 }}>Economic Intelligence Platform</p>
      <h1 style={{ margin: "0 0 16px", fontSize: 42 }}>Turn raw data into decisions.</h1>
      <p style={{ maxWidth: 720, lineHeight: 1.6 }}>
        A workspace for data ingestion, quality checks, analysis, forecasting, AI insights, and reports.
      </p>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 40 }}>
        <article><strong>Data</strong><p>Upload, profile, validate, and clean datasets.</p></article>
        <article><strong>Intelligence</strong><p>Analyze and forecast with traceable AI assistance.</p></article>
        <article><strong>Reports</strong><p>Turn approved results into professional outputs.</p></article>
      </section>
    </main>
  );
}
