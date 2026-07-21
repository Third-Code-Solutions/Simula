import type { Metadata } from "next";

import { AuthContext } from "../auth-context";
import { SignInForm } from "./sign-in-form";
import { safeNextPath } from "./safe-next-path";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function SignInPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ next?: string }> }>) {
  const { next } = await searchParams;

  return (
    <main className="centered-main" id="main-content" tabIndex={-1}>
      <AuthContext />
      <section className="auth-card" aria-labelledby="page-title">
        <p className="eyebrow">Authorized prototype access</p>
        <h1 id="page-title">Sign in</h1>
        <p className="lede">
          Use an authorized SIMULA account. SIMULA&apos;s authored demo
          artifacts are experimental, non-representative, and estimate nobody.
        </p>
        <SignInForm nextPath={safeNextPath(next)} />
      </section>
    </main>
  );
}
