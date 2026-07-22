import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <main className="access-page" id="main-content" tabIndex={-1}>
      <section className="access-context" aria-labelledby="context-title">
        <div className="admin-brand access-brand">
          <span aria-hidden="true">S</span>
          <span>SIMULA CONTROL</span>
        </div>
        <div>
          <p className="section-label">Restricted control plane</p>
          <h1 id="context-title">One account. Full platform scope.</h1>
          <p>
            Access is evaluated by the API against the private platform role
            registry on every request.
          </p>
        </div>
        <p className="access-footnote">No service key enters this browser.</p>
      </section>
      <section className="access-form" aria-labelledby="sign-in-title">
        <div>
          <p className="section-label">Administrator authentication</p>
          <h2 id="sign-in-title">Sign in</h2>
          <p>Use the authorized SIMULA superadmin account.</p>
        </div>
        <SignInForm />
      </section>
    </main>
  );
}
