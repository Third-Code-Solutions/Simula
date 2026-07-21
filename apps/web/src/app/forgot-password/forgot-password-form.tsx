"use client";

import Link from "next/link";
import { useState } from "react";

import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);

    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    if (typeof email !== "string" || !email.trim()) {
      setError("Enter your email address.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: resetError } =
        await getBrowserSupabaseClient().auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${window.location.origin}/reset-password`,
          },
        );
      if (resetError) {
        setError("Password reset is temporarily unavailable. Retry shortly.");
        return;
      }
      setMessage("If an account exists, check your email for a reset link.");
    } catch {
      setError("Password reset is temporarily unavailable. Retry shortly.");
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
        {submitting ? "Sending link…" : "Send reset link"}
      </button>
      <nav aria-label="Account actions" className="auth-links">
        <Link href="/sign-in">Back to sign in</Link>
        <Link href="/sign-up">Create account</Link>
      </nav>
    </form>
  );
}
