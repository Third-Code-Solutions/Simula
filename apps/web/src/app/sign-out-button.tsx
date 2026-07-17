"use client";

import { useState } from "react";

import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await getBrowserSupabaseClient().auth.signOut({ scope: "local" });
    } finally {
      window.location.assign("/sign-in");
    }
  }

  return (
    <button
      className="quiet-button"
      disabled={pending}
      onClick={() => void signOut()}
      type="button"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
