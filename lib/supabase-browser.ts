import { createBrowserClient } from "@supabase/ssr";

// These are Supabase publishable client values. They are safe to expose in the
// browser; privileged service-role credentials must remain backend-only.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://lqniaulkqzwfhlgbkbwc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_uAH0JP6NTHrk7mJFzbSfdQ__0EmaF32";

export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
