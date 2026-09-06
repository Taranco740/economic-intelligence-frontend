"use client";

import { FormEvent, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";
import { apiFetch, Project } from "../../lib/api";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createSupabaseBrowserClient();

  async function load() {
    try { setProjects(await apiFetch<Project[]>("/projects")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load projects"); }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? null);
      if (data.session) void load();
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
      if (session) void load(); else setProjects([]);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false); setMessage(error?.message ?? "Signed in");
  }

  async function signUp() {
    setLoading(true); setMessage("");
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false); setMessage(error?.message ?? "Account created. Check your email if confirmation is enabled.");
  }

  async function createProject(event: FormEvent) {
    event.preventDefault(); if (!name.trim()) return;
    setLoading(true); setMessage("");
    try { const project = await apiFetch<Project>("/projects", { method: "POST", body: JSON.stringify({ name: name.trim() }) }); setProjects((items) => [project, ...items]); setName(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create project"); }
    finally { setLoading(false); }
  }

  if (!userEmail) return (
    <main className="shell"><section className="card auth"><p className="eyebrow">GAMUR</p><h1>Economic intelligence, connected.</h1><p className="muted">Sign in to connect your workspace to the Gamur backend.</p><form onSubmit={signIn}><input aria-label="Email" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required /><input aria-label="Password" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /><div className="actions"><button disabled={loading}>Sign in</button><button type="button" className="secondary" onClick={signUp} disabled={loading}>Create account</button></div></form>{message && <p className="notice">{message}</p>}</section></main>
  );

  return <main className="shell"><header className="topbar"><div><p className="eyebrow">GAMUR</p><h1>Intelligence workspace</h1></div><div className="user"><span>{userEmail}</span><button className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button></div></header><section className="grid"><article className="card"><p className="eyebrow">PROJECTS</p><h2>Your workspaces</h2><form onSubmit={createProject} className="row"><input aria-label="Project name" placeholder="New project name" value={name} onChange={(e) => setName(e.target.value)} /><button disabled={loading}>Create</button></form>{projects.length === 0 ? <p className="muted">No projects yet. Create your first workspace.</p> : <div className="projects">{projects.map((project) => <div className="project" key={project.id}><strong>{project.name}</strong><span>{new Date(project.created_at).toLocaleDateString()}</span></div>)}</div>}</article><article className="card"><p className="eyebrow">PIPELINE</p><h2>Backend connected</h2><div className="steps"><span>✓ Auth</span><span>✓ Projects API</span><span>✓ Supabase</span><span>→ Datasets</span><span>→ Analysis</span><span>→ AI insights</span><span>→ Reports</span></div></article></section>{message && <p className="notice">{message}</p>}</main>;
}
