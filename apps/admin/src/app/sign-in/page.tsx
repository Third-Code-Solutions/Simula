import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <main className="centered-main" id="main-content" tabIndex={-1}>
      <section className="auth-context" aria-label="About SIMULA">
        <a
          aria-label="SIMULA main site"
          className="wordmark"
          href="https://simula-iota.vercel.app"
        >
          SIMULA
        </a>
        <div>
          <p className="eyebrow">Decision rehearsal, with receipts</p>
          <h2>Bring a draft. Find the weak spots.</h2>
          <p>
            Private project workspaces, immutable text versions, bounded demo
            runs, and inspectable provenance.
          </p>
          <div className="proof-rail">
            <p className="proof-support">
              Built for rehearsal, not prediction.
            </p>
            <ul aria-label="SIMULA product assurances" className="proof-list">
              <li>
                <span>01</span>
                <strong>Versioned</strong>
              </li>
              <li>
                <span>02</span>
                <strong>Bounded</strong>
              </li>
              <li>
                <span>03</span>
                <strong>Traceable</strong>
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
        <p className="auth-boundary">No service key enters this browser.</p>
      </section>
    </main>
  );
}
