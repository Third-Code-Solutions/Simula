import Link from "next/link";

export default function HomePage() {
  return (
    <main className="centered-main">
      <section className="shell" aria-labelledby="page-title">
        <p className="eyebrow">Walking skeleton</p>
        <h1 id="page-title">SIMULA</h1>
        <p className="lede">
          Experimental pressure testing with authored, non-representative demo
          data. The current foundation estimates nobody and is not a replacement
          for human research.
        </p>
        <p className="status" role="status">
          Foundation healthy
        </p>
        <Link className="primary-link" href="/organizations">
          Open local workspace
        </Link>
      </section>
    </main>
  );
}
