-- PostgreSQL's referential-integrity trigger checks the referenced row with
-- FOR KEY SHARE under the security-definer command owner. That lock requires
-- the table-level UPDATE privilege. The owner role is non-login and cannot be
-- assumed by runtime roles.

set role postgres;
grant update
on table api.stimulus_assets
to simula_command_owner;
grant references
on table api.stimulus_assets
to simula_command_owner;
grant references
on table api.stimulus_assets
to simula_api;
grant update
on table api.stimulus_assets
to simula_api;
grant select, update, references
on table api.stimulus_assets
to postgres;
grant delete
on table
  api.evidence_sources,
  api.evidence_source_versions,
  api.observed_outcome_sets,
  api.observed_outcome_values,
  api.stimulus_assets
to postgres;

-- Cascading RI triggers execute as the migration/table-owner role. Restore
-- DELETE only for application tables that declare an ON DELETE CASCADE child
-- trigger; runtime roles receive no additional table authority.
do $grant_cascade_delete$
declare
  child_table record;
begin
  for child_table in
    select distinct
      child_schema.nspname as schema_name,
      child_relation.relname as table_name
    from pg_catalog.pg_constraint as constraints
    join pg_catalog.pg_class as child_relation
      on child_relation.oid = constraints.conrelid
    join pg_catalog.pg_namespace as child_schema
      on child_schema.oid = child_relation.relnamespace
    where constraints.contype = 'f'
      and constraints.confdeltype = 'c'
      and child_schema.nspname in ('api', 'private')
      and child_relation.relkind = 'r'
  loop
    execute pg_catalog.format(
      'grant delete on table %I.%I to postgres',
      child_table.schema_name,
      child_table.table_name
    );
  end loop;
end
$grant_cascade_delete$;
set role postgres;
