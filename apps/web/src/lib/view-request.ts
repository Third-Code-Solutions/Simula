/**
 * Cancellation bookkeeping shared by views that own an `AbortController`.
 *
 * The request layer rejects an aborted call with the `request_cancelled`
 * problem code. That rejection is routine: it means the operator navigated
 * away or superseded the load, not that the product failed. Views call this
 * helper so a cancellation can never be rendered as an error, recorded as run
 * telemetry, or retried.
 *
 * The check is deliberately structural rather than `instanceof ApiProblem`:
 * the identity of the error class is not what distinguishes a cancellation,
 * and importing the API module here would make the helper unusable from the
 * views whose tests replace that module.
 */

const CANCELLED_CODES: ReadonlySet<string> = new Set(["request_cancelled"]);

export function isCancelledRequest(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { code, name } = error as { code?: unknown; name?: unknown };
  if (typeof code === "string" && CANCELLED_CODES.has(code)) {
    return true;
  }
  return name === "AbortError";
}
