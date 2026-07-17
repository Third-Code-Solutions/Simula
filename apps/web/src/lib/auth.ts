import { redirect } from "next/navigation";

import { getServerSupabaseClient } from "@/lib/supabase/server";

export async function requireAuthenticatedPage(
  pathname: string,
): Promise<void> {
  const supabase = await getServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }
}
