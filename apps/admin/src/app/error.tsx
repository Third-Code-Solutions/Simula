"use client";

export default function ErrorPage({ reset }: Readonly<{ reset: () => void }>) {
  return (
    <main className="message-page" id="main-content" tabIndex={-1}>
      <section>
        <p className="section-label">Platform unavailable</p>
        <h1>Control data could not load</h1>
        <p>
          The platform service is unavailable or took longer than 30 seconds.
          Retry this page. If the problem continues, check service health or
          contact your platform operator.
        </p>
        <button onClick={reset} type="button">
          Retry
        </button>
      </section>
    </main>
  );
}
