"use client";
import Link from "next/link";
import Workspace from "./components/workspace";
import { useLanguage } from "./components/language-provider";

export default function Home() {
  const { language, setLanguage, t } = useLanguage();
  return <main className="shell">
    <header className="siteHeader">
      <Link href="/" className="brand"><b>G</b><span>Gamur</span></Link>
      <div className="right"><Link href="/about">{t.about}</Link><Link href="/settings">⚙ Settings</Link><Link href="/profile">Profile</Link><Link href="/auth?mode=login">{t.signIn}</Link><select value={language} onChange={e => setLanguage(e.target.value as typeof language)}><option value="en">EN</option><option value="so">SO</option><option value="ar">ع</option></select></div>
    </header>
    <Workspace />
    <style jsx>{`:global(body){margin:0;background:#f7f8fa;color:#18212b;font-family:Inter,system-ui,sans-serif}.shell{min-height:100vh}.siteHeader{height:62px;border-bottom:1px solid #dfe4e8;display:flex;align-items:center;justify-content:space-between;padding:0 24px;background:#fbfcfd;position:relative;z-index:20}.siteHeader .brand{display:flex;align-items:center;gap:9px;font-weight:850;color:#18212b;text-decoration:none}.siteHeader .brand b{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:#142536;color:#fff}.right{display:flex;align-items:center;gap:17px;font-size:10px;color:#687580}.right a{color:inherit;text-decoration:none}.right select{border:1px solid #d8dfe4;border-radius:7px;background:#fff;padding:6px;color:#687580}@media(max-width:700px){.siteHeader{padding:0 14px}.right a:nth-child(-n+2){display:none}}`}</style>
  </main>;
}
