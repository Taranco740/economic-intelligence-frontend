"use client";

import "./auth.css";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";
import { useLanguage } from "../components/language-provider";

export default function AuthPage() {
  const { t, language, setLanguage } = useLanguage();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function switchMode(nextMode: "login" | "signup") {
    setMode(nextMode);
    setMessage("");
    setPassword("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const sb = createSupabaseBrowserClient();
      if (!sb) throw new Error(t.error);

      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) throw error;

        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setMessage(
            language === "so"
              ? "Akoonka waa la sameeyay. Hubi email-kaaga si aad u xaqiijiso."
              : language === "ar"
                ? "تم إنشاء حسابك. تحقق من بريدك الإلكتروني لتأكيد الحساب."
                : "Account created. Check your email to confirm your account."
          );
        }
        return;
      }

      const result = await sb.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;

      router.replace("/");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setMessage("");

    try {
      const sb = createSupabaseBrowserClient();
      if (!sb) throw new Error(t.error);

      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (error) throw error;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t.error);
      setBusy(false);
    }
  }

  const title = mode === "signup"
    ? language === "so" ? "Samee akoon" : language === "ar" ? "إنشاء حساب" : "Create your account"
    : t.signIn;

  return (
    <main className="auth">
      <nav>
        <Link href="/" className="brand">
          <span>G</span> Gamuur
        </Link>
        <div>
          <Link href="/learn">{t.navLearn}</Link>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as typeof language)}
          >
            <option value="en">English</option>
            <option value="so">Soomaali</option>
            <option value="ar">العربية</option>
          </select>
        </div>
      </nav>

      <section className="box">
        <div className="eyebrow">GAMUUR ACCOUNT</div>
        <h1>{title}</h1>
        <p>
          {mode === "signup"
            ? language === "so"
              ? "Samee akoonkaaga Gamuur si aad u bilowdo."
              : language === "ar"
                ? "أنشئ حساب Gamuur الخاص بك للبدء."
                : "Create your Gamuur account to get started."
            : language === "so"
              ? "Soo gal ama akoon cusub ku samee Google."
              : language === "ar"
                ? "سجّل الدخول أو أنشئ حسابًا جديدًا باستخدام Google."
                : "Sign in or create your Gamuur account."}
        </p>

        <button className="submit" type="button" onClick={signInWithGoogle} disabled={busy}>
          {busy ? "…" : "Continue with Google"}
        </button>

        <div className="divider">or</div>

        <form onSubmit={submit}>
          <label>
            {t.email}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label>
            {t.password}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>

          <button className="submit" disabled={busy}>
            {busy
              ? "…"
              : mode === "signup"
                ? language === "so" ? "Samee akoon" : language === "ar" ? "إنشاء حساب" : "Create account"
                : t.login}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
          <button type="button" onClick={() => switchMode(mode === "signup" ? "login" : "signup")}>
            {mode === "signup" ? "Sign in" : "Sign up"}
          </button>
        </div>

        {message && <div className="message">{message}</div>}
        <Link href="/" className="back">
          ← {t.back}
        </Link>
      </section>
    </main>
  );
}
