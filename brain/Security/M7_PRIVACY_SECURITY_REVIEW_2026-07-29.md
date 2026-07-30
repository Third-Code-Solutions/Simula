---
title: M7 Privacy and Security Review
status: implementation-reviewed-release-blocked
created: 2026-07-29
updated: 2026-07-29
owner: Security and privacy leads
classification: INTERNAL
source_of_truth: true
---

# M7 Privacy and Security Review

## Decision

Local implementation controls are coherent enough for disposable staging
verification. Production approval is **rejected**. No legal/privacy approver,
vendor tenant, retention/access configuration, rights-cleared behavioral data,
hosted redaction evidence, external-provider review, restore drill, or
cross-tenant database/browser proof exists.

## Data-flow findings

| Boundary | Permitted export | Prohibited export | Current state |
|---|---|---|---|
| Browser to Sentry | scrubbed error type, fixed service/environment/runtime, release | user, URL, request, body, cookie, breadcrumb, stimulus, result, transaction, message | disabled by default; unit redaction only |
| Node/Python to Sentry | scrubbed exception type, fixed service/environment, release | request, identity, URL, header, body, arbitrary context/extra, message, local variables | disabled by default; unit redaction only |
| Services to OTLP | trace/span IDs, generic operation class, route template/method/status, fixed service/environment/release | full URL/query, headers, SQL text/binds, tenant/user/project/run/agent IDs, stimulus/result/rationale/memory, exception message | disabled by default; in-memory redacted span proof only |
| Browser to Supabase | Auth only through publishable key | application schema commands, queue, private assets | existing grants/RLS contract; new migrations unexecuted |
| API to PostgreSQL | least-privilege transaction-local actor claims and typed operations | role escalation, browser service credential | code/static tests; new schema unexecuted |
| API run history to browser | tenant-authorized run state, attempt, safe reason, actor class, support correlation, timestamp | actor user ID, free metadata, audit row, payload, prompt, agent memory, rationale | strict route/schema/UI tests; migration unexecuted |
| Worker to private AI engine | compact frozen command over private origin with rotating bearer | redirect/proxy/public origin, arbitrary URL fetch, unbounded body/result | deterministic provider only; no hosted call |
| Private asset storage | approved private MIME/size metadata and server-mediated access | public bucket policy, application-table bytes | migration authored; storage exercise absent |
| External AI provider | none | every stimulus, audience, context, result, credential | disabled; admission remains prohibited |

## Threat review

### Confidential content in telemetry

Sentry and OTel use independent final-export redaction. Tests include bearer
tokens, cookies, URLs, stimuli, results, rationale-like fields, user IDs, SQL/
HTTP attributes, exception messages, events, links, and status descriptions.
Metric labels are fixed and the asset checker rejects identity labels.

Residual: SDK integrations or vendor defaults can change. Staging must inspect
actual received events/spans after induced failures and upgrades. Retention,
regional processing, RBAC, deletion, support access, and subprocessor terms are
unknown.

### Cross-tenant and behavioral evidence exposure

Application roles cannot read private action, memory, canonical payload, raw
fleet trait, or private asset tables. Public summaries are trigger-derived and
checksum-bound. Comparison requires identical frozen design/fleet members and
returns no winner. Run history projects from the durable state ledger through a
member check and fixed 50-event limit; its contract has no actor identity,
metadata, payload, prompt, memory, or rationale field.

Residual: migrations/RLS/triggers are statically parsed only. Disposable reset,
cross-tenant HTTP/storage, deletion cascade, backfill, and generated database
type proof are release blockers.

### Synthetic output mistaken for people

UI/API/schema controls label the output experimental, synthetic, not testimony,
not a population estimate, and not a causal/lift/human-preference result.
Synthetic interviews use fixed generated summaries and never expose rationale.

Residual: human accessibility, export inspection, user research, held-out
outcome validation, and legal/methodology approval are absent.

### Provider and prompt abuse

The private engine admits only the exact deterministic provider; request and
result envelopes, authentication, origin, proxy, redirect, body, deadline,
cost, cancellation, and binding checks fail closed.

Residual: no external provider may be enabled until retention/training terms,
regional processing, minimized input, structured-output red teams, prompt
injection/secret exfiltration tests, cost reservation, kill switch, and
independent benchmark governance pass.

### Supply chain and release identity

Dependencies/toolchains/images/actions are pinned, installs are frozen, peer/
SCA/secret/SBOM gates exist, container install scripts are allowlisted/denied,
and the release workflow refuses unsigned artifacts.

Residual: the new images and workflow are unexecuted. The private repository's
current GitHub plan does not support GitHub artifact attestations, so the
release workflow instead uses a keyless Sigstore bundle and exact certificate-
identity verification. The public Rekor entry exposes the repository workflow
identity and tag; a release may not run until that disclosure and the immutable
tag are explicitly authorized. Required checks remain plan-blocked.

## Approval checklist

- [x] Technical data-flow and threat delta reviewed in repository.
- [x] Default-off vendor export and external-provider admission.
- [x] Static/unit privacy redaction and low-cardinality controls.
- [x] Fail-closed signed-release workflow authored.
- [ ] Named privacy/legal/security approvers.
- [ ] Sentry/collector DPA, region, retention, RBAC, deletion, and subprocessor
  approval.
- [ ] Hosted received-event/span redaction inspection.
- [ ] Disposable database/RLS/storage/deletion/browser proof.
- [ ] External-provider assessment and adversarial evaluation, if ever enabled.
- [ ] Staging restore/rollback/alert delivery and incident exercise.
- [ ] Production go/no-go record.

Until every unchecked item applicable to the release is complete, production
promotion remains rejected.
