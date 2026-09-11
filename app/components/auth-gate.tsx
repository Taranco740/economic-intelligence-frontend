"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== "/") return;

    let active = true;
    const timer = window.setTimeout(() => {
      if (active) router.replace(`/auth?mode=signup&next=${encodeURIComponent(pathname)}`);
    }, 8000);

    async function check() {
      try {
        const sb = createSupabaseBrowserClient();
        if (!sb) {
          window.clearTimeout(timer);
          if (active) router.replace(`/auth?mode=signup&next=${encodeURIComponent(pathname)}`);
          return;
        }

        const { data } = await sb.auth.getSession();
        window.clearTimeout(timer);
        if (active && !data.session) {
          router.replace(`/auth?mode=signup&next=${encodeURIComponent(pathname)}`);
        }
      } catch (error) {
        window.clearTimeout(timer);
        console.warn("Gamur: auth check failed; sending user to sign in.", error);
        if (active) router.replace(`/auth?mode=signup&next=${encodeURIComponent(pathname)}`);
      }
    }

    void check();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [pathname, router]);

  // Render the application immediately; authentication is checked in the background.
  return <>{children}</>;
}
