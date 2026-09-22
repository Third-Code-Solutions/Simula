"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function signOut() {
    setPending(true);
    try {
      await getBrowserSupabaseClient().auth.signOut({ scope: "local" });
    } catch {
      // Local sign-out is best effort: the Auth cookies are cleared either way, and the
      // operator must leave the product even when the Auth endpoint is unreachable.
    } finally {
      router.replace("/sign-in");
      router.refresh();
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
