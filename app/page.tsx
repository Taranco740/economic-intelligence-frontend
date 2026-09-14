"use client";
import Workspace from "./components/workspace";

export default function Home() {
  return <main className="shell"><Workspace /><style jsx>{`:global(body){margin:0;background:#f7f8fa;color:#18212b;font-family:Inter,system-ui,sans-serif}.shell{min-height:100vh}`}</style></main>;
}
