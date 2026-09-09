import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createSupabaseBrowserClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn("Gamuur: Supabase environment variables are missing.");
    return null;
  }

  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
