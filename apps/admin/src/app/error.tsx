"use client";

export default function ErrorPage({ reset }: Readonly<{ reset: () => void }>) {
  return (
    <main className="message-page" id="main-content" tabIndex={-1}>
      <section>
        <p className="section-label">Platform unavailable</p>
        <h1>Control data could not load</h1>
        <p>
          The admin API did not return a safe response. Retry after checking
          service health.
        </p>
        <button onClick={reset} type="button">
          Retry
        </button>
      </section>
    </main>
  );
}
