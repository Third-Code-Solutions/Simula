import type { RunAuditHistory as RunAuditHistoryContract } from "./run-audit-history-contract";

function label(value: string): string {
  return value.replaceAll("_", " ");
}

export function RunAuditHistory({
  history,
}: Readonly<{ history: RunAuditHistoryContract }>) {
  return (
    <section
      aria-labelledby="run-audit-history-title"
      className="panel run-audit-history"
    >
      <p className="eyebrow">Durable state evidence</p>
      <h2 id="run-audit-history-title">Run audit history</h2>
      <p className="field-note">{history.disclosure}</p>
      <ol>
        {[...history.events].reverse().map((event) => (
          <li key={event.event_id}>
            <div>
              <strong>
                {event.previous_state === null
                  ? `Created as ${label(event.new_state)}`
                  : `${label(event.previous_state)} to ${label(event.new_state)}`}
              </strong>
              <span>
                {label(event.actor_type)}
                {event.attempt_number === null
                  ? ""
                  : ` · attempt ${event.attempt_number}`}
              </span>
            </div>
            <time dateTime={event.created_at}>
              {new Date(event.created_at).toLocaleString()}
            </time>
            {event.safe_reason === null ? null : (
              <p>
                Safe reason: <code>{event.safe_reason}</code>
              </p>
            )}
            <p className="resource-meta">
              Support correlation: <code>{event.correlation_id}</code>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
