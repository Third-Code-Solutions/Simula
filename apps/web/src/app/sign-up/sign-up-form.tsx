"use client";

import Link from "next/link";
import { useState } from "react";

import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignUpForm() {
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);

    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    const passwordConfirmation = form.get("passwordConfirmation");
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof passwordConfirmation !== "string"
    ) {
      setError("Enter your email address and password.");
      return;
    }
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = getBrowserSupabaseClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/sign-in`,
        },
      });
      if (signUpError) {
        setError("Account creation failed. Check your details and try again.");
        return;
      }

      if (data.session) {
        await supabase.auth.signOut({ scope: "local" });
      }
      setMessage("Account created. Check your email before signing in.");
    } catch {
      setError("Account creation is temporarily unavailable. Retry shortly.");
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
        autoComplete="new-password"
        id="password"
        minLength={8}
        name="password"
        required
        type="password"
      />
      <label htmlFor="passwordConfirmation">Confirm password</label>
      <input
        autoComplete="new-password"
        id="passwordConfirmation"
        minLength={8}
        name="passwordConfirmation"
        required
        type="password"
      />
      {error ? (
        <p className="problem" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="success" role="status">
          {message}
        </p>
      ) : null}
      <button disabled={submitting} type="submit">
        {submitting ? "Creating account…" : "Create account"}
      </button>
      <nav aria-label="Account actions" className="auth-links">
        <Link href="/sign-in">Back to sign in</Link>
      </nav>
    </form>
  );
}
