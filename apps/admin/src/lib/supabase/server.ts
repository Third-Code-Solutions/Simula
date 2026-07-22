import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function publicSupabaseConfig(): { publishableKey: string; url: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase server configuration is unavailable.");
  }
  return { publishableKey, url };
}

export async function getServerSupabaseClient() {
  const cookieStore = await cookies();
  const { publishableKey, url } = publicSupabaseConfig();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll() {
        // src/proxy.ts owns refresh-cookie persistence.
      },
    },
  });
}
