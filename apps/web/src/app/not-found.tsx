import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-main" id="main-content" tabIndex={-1}>
      <section className="not-found-card" aria-labelledby="not-found-title">
        <p className="not-found-code">ERROR / 404</p>
        <h1 id="not-found-title">This path did not run.</h1>
        <p className="lede">
          The page may have moved, or the route is outside the current
          experimental workspace.
        </p>
        <Link className="primary-link" href="/">
          Return to SIMULA
        </Link>
      </section>
    </main>
  );
}
