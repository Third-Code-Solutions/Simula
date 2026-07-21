"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        active &&
        (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || session)
      ) {
        setReady(true);
      }
    });

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError("This reset link is invalid or expired. Request a new one.");
        return;
      }
      setReady(Boolean(data.session));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);

    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    const passwordConfirmation = form.get("passwordConfirmation");
    if (
      typeof password !== "string" ||
      typeof passwordConfirmation !== "string"
    ) {
      setError("Enter and confirm your new password.");
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
    if (!ready) {
      setError("Open the password reset link from your email first.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = getBrowserSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError("Password update failed. Request a new reset link.");
        return;
      }
      await supabase.auth.signOut({ scope: "local" });
      setMessage(
        "Password updated. You can now sign in with the new password.",
      );
      setReady(false);
    } catch {
      setError("Password update is temporarily unavailable. Retry shortly.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      <label htmlFor="password">New password</label>
      <input
        autoComplete="new-password"
        id="password"
        minLength={8}
        name="password"
        required
        type="password"
      />
      <label htmlFor="passwordConfirmation">Confirm new password</label>
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
        {submitting ? "Updating password…" : "Update password"}
      </button>
      <nav aria-label="Account actions" className="auth-links">
        <Link href="/sign-in">Back to sign in</Link>
      </nav>
    </form>
  );
}
