"use client";

import Link from "next/link";
import { useLanguage } from "../components/language-provider";

export default function AboutPage() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <main className="page">
      <header><Link href="/" className="brand"><b>G</b> Gamuur</Link><nav><Link href="/">{t.backHome}</Link><Link href="/learn">{t.navLearn}</Link><Link href="/auth?mode=login">{t.signIn}</Link><Link href="/auth?mode=signup">{t.signUp}</Link><select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}><option value="en">EN</option><option value="so">SO</option><option value="ar">ع</option></select></nav></header>
      <section className="content">
        <span className="kicker">GAMUUR</span><h1>{t.aboutTitle}</h1><p className="lead">{t.aboutText}</p>
        <div className="grid">
          <article><span>01</span><h2>{t.aboutHowTitle}</h2><p>{t.aboutHowText}</p></article>
          <article><span>02</span><h2>{t.aboutAudienceTitle}</h2><p>{t.aboutAudienceText}</p></article>
          <article><span>03</span><h2>{t.aboutStoryTitle}</h2><p>{t.aboutStoryText}</p></article>
        </div>
        <Link href="/learn" className="cta">{t.aboutLearn} →</Link>
      </section>
      <style jsx>{` :global(body){margin:0;background:#f7f8f5;color:#17201b;font-family:Inter,system-ui,sans-serif}.page{min-height:100vh}header{height:64px;border-bottom:1px solid #dfe4de;padding:0 28px;display:flex;align-items:center;justify-content:space-between}.brand{display:flex;gap:8px;align-items:center;text-decoration:none;color:#17201b;font-weight:850}.brand b{width:30px;height:30px;border-radius:8px;background:#17201b;color:#fff;display:grid;place-items:center}nav{display:flex;align-items:center;gap:16px}nav a{font-size:10px;color:#68726a;text-decoration:none}select{appearance:none;border:0;background:transparent;font-size:10px;color:#68726a}.content{width:min(980px,calc(100% - 44px));margin:auto;padding:15vh 0 80px}.kicker{font-size:9px;letter-spacing:.18em;color:#8e978f}.content h1{font-size:clamp(48px,7vw,82px);line-height:.94;letter-spacing:-.07em;max-width:850px;margin:14px 0 20px}.lead{max-width:700px;color:#69736b;line-height:1.75;font-size:15px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:70px 0 35px}.grid article{background:#fff;border:1px solid #dce2db;border-radius:14px;padding:22px}.grid span{font-size:9px;color:#929a93}.grid h2{font-size:18px;letter-spacing:-.03em}.grid p{font-size:11px;line-height:1.7;color:#707971}.cta{display:inline-block;background:#17201b;color:#fff;text-decoration:none;padding:11px 15px;border-radius:9px;font-size:10px}@media(max-width:700px){header{padding:0 14px}header nav a:nth-child(2){display:none}.content{padding-top:10vh}.grid{grid-template-columns:1fr;margin-top:45px}}
      `}</style>
    </main>
  );
}
