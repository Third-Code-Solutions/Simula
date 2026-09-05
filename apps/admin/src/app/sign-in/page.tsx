import { workspaceOrigin } from "@/lib/platform-api";

import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  const origin = workspaceOrigin();

  return (
    <main className="centered-main" id="main-content" tabIndex={-1}>
      <section className="auth-context" aria-label="About SIMULA">
        {origin ? (
          <a aria-label="SIMULA main site" className="wordmark" href={origin}>
            SIMULA
          </a>
        ) : (
          <span className="wordmark">SIMULA</span>
        )}
        <div>
          <p className="eyebrow">SIMULA administration</p>
          <h2>Manage your platform.</h2>
          <p>
            Review organizations, check platform activity, and open the
            workspace that needs your attention.
          </p>
          <div className="proof-rail">
            <p className="proof-support">
              Built for rehearsal, not prediction.
            </p>
            <ul aria-label="SIMULA product assurances" className="proof-list">
              <li>
                <span>01</span>
                <strong>Organizations</strong>
              </li>
              <li>
                <span>02</span>
                <strong>Activity</strong>
              </li>
              <li>
                <span>03</span>
                <strong>Workspace access</strong>
              </li>
            </ul>
          </div>
        </div>
      </section>
      <section className="auth-card" aria-labelledby="sign-in-title">
        <p className="eyebrow">Restricted platform access</p>
        <h1 id="sign-in-title">Sign in</h1>
        <p className="lede">
          Use the authorized SIMULA superadmin account. Platform access is
          verified against the private role registry on every request.
        </p>
        <SignInForm />
        <p className="auth-boundary">
          Platform access is limited to authorized administrators.
        </p>
      </section>
    </main>
  );
}
