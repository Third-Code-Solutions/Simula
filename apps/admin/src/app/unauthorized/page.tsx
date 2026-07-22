import { SignOutButton } from "@/components/sign-out-button";

export default function UnauthorizedPage() {
  return (
    <main className="message-page" id="main-content" tabIndex={-1}>
      <section>
        <p className="section-label">Access denied</p>
        <h1>Platform role required</h1>
        <p>
          This signed-in account is not an active SIMULA superadministrator.
        </p>
        <SignOutButton />
      </section>
    </main>
  );
}
