import type { ProductRecord } from "@/lib/api";

import styles from "./dashboard.module.css";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function bool(value: unknown): boolean {
  return value === true;
}

function formatDate(value: unknown): string {
  const date = typeof value === "string" ? new Date(value) : undefined;
  return date && !Number.isNaN(date.valueOf())
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : "Date unavailable";
}

export function OwnerControls({
  audit,
  busy,
  flags,
  invitationToken,
  invitations,
  onInvite,
  onSaveFlag,
  onToggleFlag,
  ownerError,
}: Readonly<{
  audit: ProductRecord[];
  busy?: string;
  flags: ProductRecord[];
  invitationToken?: string;
  invitations: ProductRecord[];
  onInvite: (event: React.FormEvent<HTMLFormElement>) => void;
  onSaveFlag: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleFlag: (flag: ProductRecord) => void;
  ownerError?: string;
}>) {
  return (
    <section className={styles.ownerArea} aria-labelledby="owner-controls">
      <div className={styles.ownerHeading}>
        <div>
          <p className="eyebrow">Administration</p>
          <h2 id="owner-controls">Workspace controls</h2>
          <p>
            Team access, feature gates, and audit evidence. Every command is
            authorized again by the API and database.
          </p>
        </div>
        <span>Owner only</span>
      </div>

      {ownerError ? (
        <p className={styles.ownerError} role="alert">
          {ownerError}
        </p>
      ) : null}

      <div className={styles.ownerGrid}>
        <article className={styles.adminPanel} aria-labelledby="team-title">
          <header>
            <span className={styles.panelNumber}>01</span>
            <div>
              <h3 id="team-title">Team invitations</h3>
              <p>Issue a scoped invitation that expires in seven days.</p>
            </div>
          </header>
          <form className="form-stack" onSubmit={onInvite}>
            <label htmlFor="invite-email">Email address</label>
            <input
              autoComplete="email"
              id="invite-email"
              name="email"
              placeholder="analyst@organization.com"
              required
              type="email"
            />
            <label htmlFor="invite-role">Workspace role</label>
            <select defaultValue="viewer" id="invite-role" name="role">
              <option value="viewer">Viewer — read only</option>
              <option value="editor">Editor — create and run</option>
            </select>
            <button disabled={busy === "invitation"} type="submit">
              {busy === "invitation"
                ? "Creating invitation…"
                : "Create invitation"}
            </button>
          </form>

          {invitationToken ? (
            <div className={styles.token} role="status">
              <strong>One-time invitation token</strong>
              <code>{invitationToken}</code>
              <span>Share only through an approved private channel.</span>
            </div>
          ) : null}

          <div className={styles.subsectionHeading}>
            <h4>Pending invitations</h4>
            <span>{invitations.length}</span>
          </div>
          {invitations.length ? (
            <ul className={styles.compactList}>
              {invitations.map((invitation) => (
                <li key={text(invitation.id)}>
                  <span>
                    <strong>{text(invitation.email)}</strong>
                    <small>{formatDate(invitation.expires_at)}</small>
                  </span>
                  <span className={styles.recordState}>
                    {text(invitation.role)} · {text(invitation.status)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.inlineEmpty}>No pending invitations.</p>
          )}
        </article>

        <article className={styles.adminPanel} aria-labelledby="flags-title">
          <header>
            <span className={styles.panelNumber}>02</span>
            <div>
              <h3 id="flags-title">Feature gates</h3>
              <p>Change controlled workspace behavior with an audit reason.</p>
            </div>
          </header>
          <form className="form-stack" onSubmit={onSaveFlag}>
            <label htmlFor="flag-key">Flag key</label>
            <input
              id="flag-key"
              name="flagKey"
              pattern="[a-z][a-z0-9_.]{0,63}"
              placeholder="reports.comparison"
              required
            />
            <label htmlFor="flag-reason">Change reason</label>
            <input
              id="flag-reason"
              maxLength={500}
              name="reason"
              placeholder="Why this workspace needs the change"
              required
            />
            <label className={styles.checkbox}>
              <input name="enabled" type="checkbox" /> Enabled after save
            </label>
            <button disabled={busy === "flag"} type="submit">
              {busy === "flag" ? "Saving feature gate…" : "Save feature gate"}
            </button>
          </form>

          <div className={styles.subsectionHeading}>
            <h4>Configured gates</h4>
            <span>{flags.length}</span>
          </div>
          {flags.length ? (
            <ul className={styles.flagList}>
              {flags.map((flag) => {
                const flagKey = text(flag.flag_key);
                const enabled = bool(flag.enabled);
                return (
                  <li key={text(flag.id)}>
                    <span>
                      <strong>{flagKey}</strong>
                      <small>Version {text(flag.version)}</small>
                    </span>
                    <button
                      aria-label={`${enabled ? "Disable" : "Enable"} ${flagKey}`}
                      className={enabled ? styles.enabledButton : undefined}
                      disabled={busy === `flag:${flagKey}`}
                      onClick={() => onToggleFlag(flag)}
                      type="button"
                    >
                      {enabled ? "Enabled" : "Disabled"}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.inlineEmpty}>No workspace-specific gates.</p>
          )}
        </article>

        <article
          className={`${styles.adminPanel} ${styles.auditPanel}`}
          aria-labelledby="audit-title"
        >
          <header>
            <span className={styles.panelNumber}>03</span>
            <div>
              <h3 id="audit-title">Recent audit events</h3>
              <p>Restricted domain evidence, newest first.</p>
            </div>
          </header>
          {audit.length ? (
            <ol className={styles.auditList}>
              {audit.slice(0, 12).map((event) => (
                <li key={text(event.id)}>
                  <span>
                    <strong>{text(event.action)}</strong>
                    <small>{text(event.source_service)}</small>
                  </span>
                  <span className={styles.recordState}>
                    {text(event.outcome)}
                  </span>
                  <time dateTime={text(event.created_at)}>
                    {formatDate(event.created_at)}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.inlineEmpty}>No audit events returned.</p>
          )}
        </article>
      </div>
    </section>
  );
}
