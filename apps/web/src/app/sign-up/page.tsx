import type { Metadata } from "next";

import { AuthContext } from "../auth-context";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Create account",
};

export default function SignUpPage() {
  return (
    <main className="centered-main" id="main-content" tabIndex={-1}>
      <AuthContext />
      <section className="auth-card" aria-labelledby="page-title">
        <p className="eyebrow">Authorized prototype access</p>
        <h1 id="page-title">Create account</h1>
        <p className="lede">
          Create an authorized SIMULA account. You may need to confirm your
          email before signing in.
        </p>
        <SignUpForm />
      </section>
    </main>
  );
}
