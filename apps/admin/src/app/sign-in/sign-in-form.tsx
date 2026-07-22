"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    if (typeof email !== "string" || typeof password !== "string") {
      setError("Enter your email address and password.");
      return;
    }

    setBusy(true);
    try {
      const { error: signInError } =
        await getBrowserSupabaseClient().auth.signInWithPassword({
          email,
          password,
        });
      if (signInError) {
        setError("Sign-in failed. Check your credentials and try again.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Sign-in is temporarily unavailable. Retry shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sign-in-form" onSubmit={submit} noValidate>
      <label htmlFor="email">Email address</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button disabled={busy} type="submit">
        {busy ? "Verifying access..." : "Sign in to Control"}
      </button>
    </form>
  );
}
