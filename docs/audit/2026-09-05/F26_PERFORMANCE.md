# F26 bounded database performance review

Observed 2026-09-05 approximately 09:56–10:00 UTC on Supabase Simula `ywiwmczccktwzqyhzhiz`. Read-only scope: refreshed performance advisor, catalog/index/FK metadata, relation sizes, seven representative `EXPLAIN (FORMAT JSON)` SELECT plans. No ANALYZE, table scan execution, user records, index mutation, or statistics mutation. UUID literals below are invented fixed test values, not retrieved tenant identifiers. Plans were obtained through the administrative connector and do not represent authenticated RLS execution plans.

## Refreshed findings and scale

Advisor timestamp `2026-09-05T09:56:47.943Z`: **72 unindexed_foreign_keys INFO**, **53 unused_index INFO**, **1 auth_db_connections_absolute**. Counts are notices, not 126 demonstrated defects. The connection-allocation setting was not changed.

Largest inspected api/private heap relations: audit_events40960 bytes, campaign_lab_events32768, audience_versions24576, campaign_lab_secrets16384, idempotency_keys16384, campaign_lab_runs16384. Catalog estimates include -1 (unknown), so row estimates should not be treated as actual counts. Current evidence does not show an immediate query-latency or volume-driven release blocker. No index should be dropped solely because the current small workload has not used it.

## Exact representative planning evidence

Let O=`00000000-0000-4000-8000-000000000001` and R=`00000000-0000-4000-8000-000000000002`, both cast to UUID. Every predicate below was planned as `EXPLAIN (FORMAT JSON) SELECT id FROM <table> WHERE <predicate>` unless stated otherwise. Cost units are planner estimates, not milliseconds or measured execution time.

| Table / predicate | Actual plan | Estimated total cost / rows |
| --- | --- | --- |
| private.campaign_lab_secrets, `run_id=R` | Seq Scan, filter run_id | 17.62 / 3 |
| private.campaign_lab_secrets, `organization_id=O AND artifact_id=R` | Seq Scan, both predicates filters | 19.15 / 1 |
| api.campaign_lab_events, `organization_id=O AND artifact_id=R` | Index Scan campaign_lab_events_run_created_idx; index condition organization_id, artifact_id residual filter | 2.36 / 1 |
| api.simulation_runs, `organization_id=O AND project_id=R` | Index Scan simulation_runs_organization_state_idx; index condition organization_id, project_id residual filter | 2.37 / 1 |
| private.idempotency_keys, `organization_id=O` | Seq Scan, organization_id filter | 13.88 / 2 |
| private.phase4_command_receipts, `organization_id=O` | Bitmap Heap Scan using phase4_command_receipts_actor_scope_key_unique; organization_id index condition | 7.11 / 2 |
| api.campaign_lab_runs retention selection below | Limit → Sort → Seq Scan | 2.13 / 1 |

The retention SELECT was:

```sql
EXPLAIN (FORMAT JSON)
SELECT id, organization_id, run_type
FROM api.campaign_lab_runs
WHERE status IN ('succeeded', 'failed', 'canceled')
  AND retention_until <= statement_timestamp()
ORDER BY retention_until, created_at, id
LIMIT 25;
```

It is the bounded selection shape from `20260803020312_campaign_lab_retention_cleanup.sql`; locking was omitted because this review does not claim concurrency behavior. Its existing partial index is `(retention_until,id)` over terminal statuses. The small table makes a sequential plan unsurprising; adding a duplicate retention index is not justified now. At scale, assess whether including created_at removes a meaningful sort before replacing anything.

## Potential growth candidates, not demonstrated current defects

**Future Campaign Lab secrets run lookup.** The live table has only `campaign_lab_secrets_pkey(id)`. Actual worker claim looks up `secrets.run_id=claimed.id`; cancellation/finalization delete by run_id in `20260802060315_campaign_simulation_lab.sql` lines562,606,630,661; additional completion functions use the same predicate in `20260802131842_campaign_lab_durable_workflows.sql:242`, `20260802150729_campaign_lab_survey_import_workflow.sql:248`, and `20260807100937_aggregate_forecast_registry.sql:540`. The live FK `(organization_id,run_id)` cascades from campaign_lab_runs. Candidate **nonunique `(run_id,organization_id)`** supports the actual run-only lookup and both cascade equality columns. Do not put organization_id first merely to satisfy a notice: that is a poorer leading column for the observed run-only calls.

**Future Campaign Lab secrets artifact cascade.** Live `(organization_id,artifact_id)` FK cascades from campaign_lab_artifacts, whose retention function deletes terminal expired artifacts in bounded batches. Candidate **nonunique `(artifact_id,organization_id)`** could avoid a secrets-table scan per deleted artifact and uses the existing globally unique artifact identity as the leading key. Do not add uniqueness unless the domain separately requires it. Current plan evidence establishes an absent index access path; it does not establish that an index is presently needed or a measured speedup. Both candidates require realistic-volume evaluation before deciding on a migration.

**Lower-priority tenant deletion candidates:** idempotency_keys.organization_id and scope_organization_id both cascade from organizations, but the existing idempotency expression index begins actor_user_id. Organization predicate plans sequentially. An organization-led index may be warranted as receipt volume grows; the second FK should be evaluated separately using actual scoped deletion workload. Current16KB relation does not justify a production emergency. phase4_command_receipts already produced an index-backed plan despite its organization FK notice, so do not duplicate indexes without larger-volume evidence.

## Notices that should not drive blanket changes

Catalog-confirmed useful existing indexes include report_artifacts `(run_id,schema_version)` unique, run_outbox `(run_id,generation)` unique, and run_events `(run_id,created_at,id)`. Their FKs additionally carry organization_id, but run IDs are globally unique; existing leading run_id access can narrow to one run before tenant filtering. These notices alone do not justify redundant `(organization_id,run_id)` indexes.

Campaign_lab_events has organization/campaign and organization/run history indexes; artifact cascade uses the organization prefix with a residual artifact filter. simulation_runs has organization/state access but project cascade filters within a tenant. Candidates `(organization_id,artifact_id)` and `(organization_id,project_id)` may help large tenants, but current tiny-table cost2.36/2.37 evidence does not establish urgency. Auth-user attribution FKs on created_by/updated_by and the53 unused-index notices require workload/retention evidence rather than automated cleanup.

## Verification limits and next action

PASSED catalog and seven EXPLAIN reads; no user content retrieved. NOT RUN: executed query timing, EXPLAIN ANALYZE, hypothetical-index planning, realistic-cardinality local benchmark, authenticated RLS-plan comparison, organization deletion concurrency, or index creation/drop. No hosted migration was applied.

F26's bounded evaluate-and-justify acceptance is satisfied with explicit growth follow-up. **No extra migration is recommended for cost17/19 plans on tiny relations alone.** Revisit the two secrets access paths with realistic disposable volume and measured worker/retention timings as usage grows. Preserve all existing indexes until their constraint and operational role is understood. This bounded review does not certify all database performance paths.
