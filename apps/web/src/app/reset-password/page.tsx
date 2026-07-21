import type { Metadata } from "next";

import { AuthContext } from "../auth-context";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
};

export default function ResetPasswordPage() {
  return (
    <main className="centered-main" id="main-content" tabIndex={-1}>
      <AuthContext />
      <section className="auth-card" aria-labelledby="page-title">
        <p className="eyebrow">Account recovery</p>
        <h1 id="page-title">Set new password</h1>
        <p className="lede">Choose a new password for your SIMULA account.</p>
        <ResetPasswordForm />
      </section>
    </main>
  );
}
