-- Complete the checked-in demo fixture's governance manifest.  This forward
-- correction is safe for Phase 2: the hosted project has no tenant/run rows,
-- and every future run freezes this exact manifest plus its new checksum.
with governed_fixture as (
  select pg_catalog.jsonb_build_object(
    'audience_cells', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('key', 'authored_demo', 'weight', 1.0)
    ),
    'dependencies', pg_catalog.jsonb_build_array(
      'phase2_demo_v1 method',
      'deterministic_mock provider'
    ),
    'disclosure_version', 'phase2_demo_v1',
    'kind', 'authored_demo',
    'lifecycle',
      'Migration-managed; retained with repository history and superseded by version.',
    'method_version', 'phase2_demo_v1',
    'non_representative', true,
    'owner', 'SIMULA methodology',
    'prohibited_uses', pg_catalog.jsonb_build_array(
      'population inference',
      'predictive decision making',
      'replacement for human research'
    ),
    'purpose',
      'Exercise the Phase 2 deterministic pipeline with synthetic authored inputs.',
    'scope', 'English campaign-message rehearsal in the Philippines prototype scope.',
    'source', 'Repository-authored synthetic fixture; no participant or customer data.',
    'transformation',
      'No measured observations; one authored cell has a fixed weight of 1.0.'
  ) as manifest
)
update api.audience_versions as versions
set manifest = governed_fixture.manifest,
    checksum_sha256 = pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(governed_fixture.manifest::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    )
from governed_fixture
where versions.id = '00000000-0000-4000-8000-0000000000d1'::uuid
  and versions.organization_id is null
  and versions.kind = 'authored_demo'
  and versions.admission_status = 'approved_demo'
  and versions.is_non_representative;

do $check$
begin
  if not exists (
    select 1
    from api.audience_versions as versions
    where versions.id = '00000000-0000-4000-8000-0000000000d1'::uuid
      and versions.manifest ?& array[
        'audience_cells',
        'dependencies',
        'disclosure_version',
        'kind',
        'lifecycle',
        'method_version',
        'non_representative',
        'owner',
        'prohibited_uses',
        'purpose',
        'scope',
        'source',
        'transformation'
      ]
  ) then
    raise exception using message = 'phase2_audience_governance_update_failed';
  end if;
end
$check$;
