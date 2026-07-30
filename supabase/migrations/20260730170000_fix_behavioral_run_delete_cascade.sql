-- Preserve simulation-run deletion after behavioral results became owned by the
-- non-login worker owner. PostgreSQL executes the foreign-key cascade through
-- that owner, whose prior least-privilege ACL omitted DELETE.

set role postgres;

grant delete on table api.behavioral_run_results to simula_worker_owner;

do $verify_behavioral_result_delete$
begin
  if not pg_catalog.has_table_privilege(
    'simula_worker_owner',
    'api.behavioral_run_results',
    'delete'
  ) then
    raise exception
      'simula_worker_owner requires DELETE for the simulation-run cascade';
  end if;
end
$verify_behavioral_result_delete$;

set role postgres;

-- Supabase records migration history in the same session after this script.
set role postgres;
