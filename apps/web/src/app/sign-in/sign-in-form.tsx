"use client";

import Link from "next/link";
import { useState } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { recordSignIn } from "@/lib/api";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignInForm({ nextPath }: Readonly<{ nextPath: string }>) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      getBrowserSupabaseClient();
    } catch {
      // The submit path reports configuration failures to the user.
    }
  }, []);

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

    setSubmitting(true);
    try {
      const supabase = getBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError("Sign-in failed. Check your credentials and try again.");
        return;
      }
      try {
        await recordSignIn();
      } catch {
        await supabase.auth.signOut({ scope: "local" });
        setError("Sign-in could not be audited safely. Retry shortly.");
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Sign-in is temporarily unavailable. Retry shortly.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      <label htmlFor="email">Email address</label>
      <input
        autoComplete="email"
        id="email"
        name="email"
        required
        type="email"
      />
      <label htmlFor="password">Password</label>
      <input
        autoComplete="current-password"
        id="password"
        minLength={1}
        name="password"
        required
        type="password"
      />
      {error ? (
        <p className="problem" role="alert">
          {error}
        </p>
      ) : null}
      <button disabled={submitting} type="submit">
        {submitting ? "Signing in…" : "Sign in"}
      </button>
      <nav aria-label="Account actions" className="auth-links">
        <Link href="/forgot-password">Forgot password?</Link>
        <Link href="/sign-up">Create account</Link>
      </nav>
    </form>
  );
}
