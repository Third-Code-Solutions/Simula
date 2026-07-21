import type { Metadata } from "next";

import { AuthContext } from "../auth-context";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
};

export default function ForgotPasswordPage() {
  return (
    <main className="centered-main" id="main-content" tabIndex={-1}>
      <AuthContext />
      <section className="auth-card" aria-labelledby="page-title">
        <p className="eyebrow">Account recovery</p>
        <h1 id="page-title">Forgot password?</h1>
        <p className="lede">
          Enter your email and we&apos;ll send a secure password reset link.
        </p>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
