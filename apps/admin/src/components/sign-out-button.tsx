"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await getBrowserSupabaseClient().auth.signOut({ scope: "local" });
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <button
      className="quiet-button"
      disabled={busy}
      onClick={signOut}
      type="button"
    >
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}
