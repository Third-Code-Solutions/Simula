-- The hosted project contained an out-of-band public SECURITY DEFINER helper
-- not used by SIMULA. Keep the helper intact for an operator to inspect, but
-- remove every browser/runtime execution path from the exposed schema.
do $revoke_hosted_function$
begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$revoke_hosted_function$;
