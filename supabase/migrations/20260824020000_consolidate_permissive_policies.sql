-- PostgreSQL ORs permissive RLS policies for the same role/action. Consolidate
-- those equivalent OR expressions into one survivor per boundary so the live
-- advisor is quiet without changing authorization semantics.

set role postgres;

do $consolidate_permissive_policies$
declare
  policy_group record;
  actual_policies text[];
  expected_policies text[];
  using_expression text;
  check_expression text;
  redundant_policy text;
begin
  for policy_group in
    select *
    from (
      values
        (
          'api', 'organization_invitations', 'simula_command_owner', 'SELECT',
          'organization_invitations_command_select',
          array[
            'organization_invitations_command_accept_select',
            'organization_invitations_command_select'
          ]::text[]
        ),
        (
          'api', 'organization_memberships', 'simula_command_owner', 'INSERT',
          'organization_memberships_command_insert',
          array[
            'organization_memberships_command_insert',
            'organization_memberships_command_invitation_insert'
          ]::text[]
        ),
        (
          'api', 'organizations', 'simula_command_owner', 'DELETE',
          'organizations_command_delete_after_cleanup',
          array[
            'organizations_command_delete_after_cleanup',
            'organizations_command_delete_after_worker_cleanup'
          ]::text[]
        ),
        (
          'api', 'organizations', 'simula_command_owner', 'SELECT',
          'organizations_command_select',
          array[
            'organizations_command_select',
            'organizations_command_select_for_worker_deletion'
          ]::text[]
        ),
        (
          'api', 'simulation_runs', 'simula_command_owner', 'SELECT',
          'simulation_runs_command_select',
          array[
            'simulation_runs_command_select',
            'simulation_runs_command_select_for_worker_deletion'
          ]::text[]
        ),
        (
          'api', 'simulation_runs', 'simula_command_owner', 'UPDATE',
          'simulation_runs_command_cancel_update',
          array[
            'simulation_runs_command_cancel_update',
            'simulation_runs_command_trace_update'
          ]::text[]
        ),
        (
          'private', 'audit_events', 'simula_command_owner', 'INSERT',
          'audit_events_command_insert',
          array[
            'audit_events_campaign_evidence_insert',
            'audit_events_campaign_lab_command_insert',
            'audit_events_command_cancel_insert',
            'audit_events_command_insert',
            'audit_events_command_phase4_insert',
            'audit_events_command_sharing_insert',
            'audit_events_command_sign_in_insert'
          ]::text[]
        ),
        (
          'private', 'audit_events', 'simula_worker_owner', 'INSERT',
          'audit_events_worker_owner_insert',
          array[
            'audit_events_campaign_evidence_worker_insert',
            'audit_events_campaign_lab_worker_insert',
            'audit_events_worker_control_insert',
            'audit_events_worker_owner_insert'
          ]::text[]
        ),
        (
          'private', 'organization_deletion_requests', 'simula_command_owner', 'SELECT',
          'organization_deletion_requests_command_select',
          array[
            'organization_deletion_requests_command_select',
            'organization_deletion_requests_worker_select'
          ]::text[]
        ),
        (
          'private', 'organization_deletion_requests', 'simula_command_owner', 'UPDATE',
          'organization_deletion_requests_command_update',
          array[
            'organization_deletion_requests_command_update',
            'organization_deletion_requests_worker_update'
          ]::text[]
        ),
        (
          'private', 'run_events', 'simula_command_owner', 'INSERT',
          'run_events_command_insert',
          array[
            'run_events_command_cancel_insert',
            'run_events_command_insert'
          ]::text[]
        )
    ) as groups(
      schema_name,
      table_name,
      role_name,
      command_name,
      survivor,
      policy_names
    )
  loop
    select pg_catalog.array_agg(expected.name order by expected.name)
      into expected_policies
    from pg_catalog.unnest(policy_group.policy_names) as expected(name);

    select pg_catalog.array_agg(policies.policyname order by policies.policyname)
      into actual_policies
    from pg_catalog.pg_policies as policies
    where policies.schemaname = policy_group.schema_name
      and policies.tablename = policy_group.table_name
      and policies.permissive = 'PERMISSIVE'
      and policies.cmd = policy_group.command_name
      and policies.roles::text[] = array[policy_group.role_name]::text[];

    if actual_policies is distinct from expected_policies then
      raise exception using
        errcode = '55000',
        message = pg_catalog.format(
          'simula_policy_consolidation_drift:%s.%s:%s:%s',
          policy_group.schema_name,
          policy_group.table_name,
          policy_group.role_name,
          policy_group.command_name
        );
    end if;

    if policy_group.command_name in ('SELECT', 'DELETE') then
      select pg_catalog.string_agg(
        pg_catalog.format('(%s)', policies.qual),
        ' or ' order by policies.policyname
      ) into using_expression
      from pg_catalog.pg_policies as policies
      where policies.schemaname = policy_group.schema_name
        and policies.tablename = policy_group.table_name
        and policies.policyname = any (policy_group.policy_names);

      execute pg_catalog.format(
        'alter policy %I on %I.%I using (%s)',
        policy_group.survivor,
        policy_group.schema_name,
        policy_group.table_name,
        using_expression
      );
    elsif policy_group.command_name = 'INSERT' then
      select pg_catalog.string_agg(
        pg_catalog.format('(%s)', policies.with_check),
        ' or ' order by policies.policyname
      ) into check_expression
      from pg_catalog.pg_policies as policies
      where policies.schemaname = policy_group.schema_name
        and policies.tablename = policy_group.table_name
        and policies.policyname = any (policy_group.policy_names);

      execute pg_catalog.format(
        'alter policy %I on %I.%I with check (%s)',
        policy_group.survivor,
        policy_group.schema_name,
        policy_group.table_name,
        check_expression
      );
    elsif policy_group.command_name = 'UPDATE' then
      select
        pg_catalog.string_agg(
          pg_catalog.format('(%s)', policies.qual),
          ' or ' order by policies.policyname
        ),
        pg_catalog.string_agg(
          pg_catalog.format(
            '(%s)',
            coalesce(policies.with_check, policies.qual, 'true')
          ),
          ' or ' order by policies.policyname
        )
      into using_expression, check_expression
      from pg_catalog.pg_policies as policies
      where policies.schemaname = policy_group.schema_name
        and policies.tablename = policy_group.table_name
        and policies.policyname = any (policy_group.policy_names);

      execute pg_catalog.format(
        'alter policy %I on %I.%I using (%s) with check (%s)',
        policy_group.survivor,
        policy_group.schema_name,
        policy_group.table_name,
        using_expression,
        check_expression
      );
    else
      raise exception using
        errcode = '55000',
        message = 'simula_policy_consolidation_command_unsupported';
    end if;

    foreach redundant_policy in array policy_group.policy_names loop
      if redundant_policy <> policy_group.survivor then
        execute pg_catalog.format(
          'drop policy %I on %I.%I',
          redundant_policy,
          policy_group.schema_name,
          policy_group.table_name
        );
      end if;
    end loop;
  end loop;
end
$consolidate_permissive_policies$;

-- Runtime admission compares deployed schema with the exact final migration.
grant create on schema private to simula_worker_owner;
set role simula_worker_owner;

do $patch_runtime_migration_head$
declare
  targets pg_catalog.regprocedure[] := array[
    'private.runtime_schema_readiness()'::pg_catalog.regprocedure,
    'private.runtime_observability_snapshot()'::pg_catalog.regprocedure
  ];
  target pg_catalog.regprocedure;
  original_definition text;
  replacement_definition text;
begin
  foreach target in array targets loop
    select pg_catalog.pg_get_functiondef(target::oid) into original_definition;
    if original_definition like '%20260824020000::bigint%' then
      continue;
    end if;
    replacement_definition := pg_catalog.replace(
      original_definition,
      '20260824010000::bigint',
      '20260824020000::bigint'
    );
    if replacement_definition = original_definition then
      raise exception using errcode = '55000',
        message = 'simula_runtime_policy_head_patch_failed';
    end if;
    execute replacement_definition;
  end loop;
end
$patch_runtime_migration_head$;

reset role;
set role postgres;
revoke create on schema private from simula_worker_owner;

-- Publish a new runtime contract at the final schema head instead of mutating
-- historical V3 functions whose owners differ between local and hosted stacks.
create function private.runtime_schema_readiness_v4()
returns table (migration_version bigint, rls_force_enabled boolean)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user not in ('simula_api', 'simula_worker') then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  return query
  select
    20260824020000::bigint,
    not exists (
      select 1
      from pg_catalog.pg_class as relations
      join pg_catalog.pg_namespace as schemas on schemas.oid = relations.relnamespace
      where schemas.nspname in ('api', 'private')
        and relations.relkind in ('r', 'p')
        and (not relations.relrowsecurity or not relations.relforcerowsecurity)
    );
end
$function$;

create function private.runtime_observability_snapshot_v4()
returns table (
  migration_version bigint,
  rls_force_enabled boolean,
  queued_count bigint,
  running_count bigint,
  retrying_count bigint,
  cancel_requested_count bigint,
  succeeded_count bigint,
  failed_count bigint,
  canceled_count bigint,
  stuck_lease_count bigint,
  oldest_cancel_requested_age_seconds numeric
)
language plpgsql
security definer
set search_path = ''
set row_security = 'on'
as $function$
begin
  if session_user not in ('simula_api', 'simula_worker') then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  return query
  select
    20260824020000::bigint,
    not exists (
      select 1
      from pg_catalog.pg_class as relations
      join pg_catalog.pg_namespace as schemas on schemas.oid = relations.relnamespace
      where schemas.nspname in ('api', 'private')
        and relations.relkind in ('r', 'p')
        and (not relations.relrowsecurity or not relations.relforcerowsecurity)
    ),
    pg_catalog.count(*) filter (where runs.state = 'queued'),
    pg_catalog.count(*) filter (where runs.state = 'running'),
    pg_catalog.count(*) filter (where runs.state = 'retrying'),
    pg_catalog.count(*) filter (where runs.state = 'cancel_requested'),
    pg_catalog.count(*) filter (where runs.state = 'succeeded'),
    pg_catalog.count(*) filter (where runs.state = 'failed'),
    pg_catalog.count(*) filter (where runs.state = 'canceled'),
    pg_catalog.count(*) filter (
      where runs.state in ('running', 'retrying')
        and runs.worker_lease_expires_at < pg_catalog.statement_timestamp()
    ),
    coalesce(
      extract(
        epoch from pg_catalog.statement_timestamp()
          - pg_catalog.min(
            case when runs.state = 'cancel_requested' then runs.updated_at end
          )
      ),
      0::numeric
    )
  from api.simulation_runs as runs;
end
$function$;

revoke all on function private.runtime_schema_readiness_v4()
  from public, anon, authenticated, simula_api, simula_worker,
    simula_worker_owner, postgres;
revoke all on function private.runtime_observability_snapshot_v4()
  from public, anon, authenticated, simula_api, simula_worker,
    simula_worker_owner, postgres;
grant execute on function private.runtime_schema_readiness_v4()
  to simula_api, simula_worker;
grant execute on function private.runtime_observability_snapshot_v4()
  to simula_api, simula_worker;

set role postgres;
