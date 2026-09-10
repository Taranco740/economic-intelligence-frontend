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
    async function check() {
      const protectedChat = pathname === "/";
      if (!protectedChat) {
        if (active) setChecking(false);
        return;
      }

      const sb = createSupabaseBrowserClient();
      if (!sb) {
        router.replace(`/auth?mode=signup&next=${encodeURIComponent(pathname)}`);
        return;
      }

      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        router.replace(`/auth?mode=signup&next=${encodeURIComponent(pathname)}`);
        return;
      }
      if (active) setChecking(false);
    }
    void check();
    return () => { active = false; };
  }, [pathname, router]);

  if (pathname === "/" && checking) {
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f7f8f5", color: "#68716a", fontFamily: "Inter, system-ui, sans-serif" }}>Loading Gamuur…</main>;
  }

  return <>{children}</>;
}
