"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function check() {
      const protectedChat = pathname === "/";
      if (!protectedChat) {
        if (active) setChecking(false);
        return;
      }

      try {
        const sb = createSupabaseBrowserClient();
        if (!sb) {
          router.replace(`/auth?mode=signup&next=${encodeURIComponent(pathname)}`);
          return;
        }

        // Never leave the landing page stuck on "Loading" if the auth
        // service or browser storage is unavailable.
        const sessionResult = await Promise.race([
          sb.auth.getSession(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Auth check timed out")), 8000);
          }),
        ]);

        if (!sessionResult.data.session) {
          router.replace(`/auth?mode=signup&next=${encodeURIComponent(pathname)}`);
          return;
        }

        if (active) setChecking(false);
      } catch (error) {
        console.warn("Gamuur: auth check failed; sending user to sign in.", error);
        if (active) {
          router.replace(`/auth?mode=signup&next=${encodeURIComponent(pathname)}`);
        }
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    void check();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [pathname, router]);

  if (pathname === "/" && checking) {
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f7f8f5", color: "#68716a", fontFamily: "Inter, system-ui, sans-serif" }}>Loading Gamuur…</main>;
  }

  return <>{children}</>;
}
