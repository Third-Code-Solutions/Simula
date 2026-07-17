import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

function publicSupabaseConfig(): { publishableKey: string; url: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Supabase proxy configuration is unavailable.");
  }

  return { publishableKey, url };
}

/** Refreshes Supabase cookies. Authorization is rechecked by each protected page and FastAPI. */
export async function refreshSupabaseSession(
  request: NextRequest,
): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const { publishableKey, url } = publicSupabaseConfig();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, options, value } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getClaims verifies the JWT and lets the SSR client refresh an expired token.
  await supabase.auth.getClaims();
  return response;
}
