export default function Loading() {
  return (
    <main
      className="loading-page"
      aria-busy="true"
      aria-label="Loading platform dashboard"
    >
      <div className="loading-header" />
      <div className="loading-title" />
      <div className="loading-metrics" />
      <div className="loading-table" />
    </main>
  );
}
