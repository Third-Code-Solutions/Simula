import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

function publicSupabaseConfig(): { publishableKey: string; url: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Supabase browser configuration is unavailable.");
  }

  return { publishableKey, url };
}

/** Browser Auth client only. Domain data is always requested from FastAPI. */
export function getBrowserSupabaseClient(): SupabaseClient {
  browserClient ??= createBrowserClient(
    publicSupabaseConfig().url,
    publicSupabaseConfig().publishableKey,
  );
  return browserClient;
}
