import { SignInForm } from "./sign-in-form";

function safeNextPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/organizations";
  }
  return value;
}

export default async function SignInPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ next?: string }> }>) {
  const { next } = await searchParams;

  return (
    <main className="centered-main">
      <section className="auth-card" aria-labelledby="page-title">
        <p className="eyebrow">SIMULA local prototype</p>
        <h1 id="page-title">Sign in</h1>
        <p className="lede">
          Use an authorized local account. SIMULA&apos;s authored demo artifacts
          are experimental, non-representative, and estimate nobody.
        </p>
        <SignInForm nextPath={safeNextPath(next)} />
      </section>
    </main>
  );
}
