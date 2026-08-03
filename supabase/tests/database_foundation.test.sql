begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(35);

-- 01
select extensions.ok(
  pg_catalog.has_schema_privilege('postgres', 'api', 'USAGE')
    and pg_catalog.has_schema_privilege('postgres', 'private', 'USAGE'),
  'api and private schemas exist'
);

-- 02
select extensions.is(
  (
    select pg_catalog.array_agg(
      pg_catalog.format('%I.%I', namespaces.nspname, relations.relname)
      order by namespaces.nspname, relations.relname
    )
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and relations.relkind = 'r'
  ),
  array[
    'api.audience_versions',
    'api.audiences',
    'api.behavioral_agent_public_summaries',
    'api.behavioral_evaluation_members',
    'api.behavioral_evaluation_protocol_versions',
    'api.behavioral_evaluation_protocols',
    'api.behavioral_evaluation_runs',
    'api.behavioral_fleet_summaries',
    'api.behavioral_report_evidence',
    'api.behavioral_round_summaries',
    'api.behavioral_run_results',
    'api.campaign_evidence_events',
    'api.campaign_evidence_runs',
    'api.campaign_lab_artifacts',
    'api.campaign_lab_campaigns',
    'api.campaign_lab_events',
    'api.campaign_lab_runs',
    'api.context_graph_versions',
    'api.evaluation_runs',
    'api.evidence_source_versions',
    'api.evidence_sources',
    'api.feature_flags',
    'api.feedback_records',
    'api.methodology_versions',
    'api.observed_outcome_sets',
    'api.observed_outcome_values',
    'api.organization_invitations',
    'api.organization_memberships',
    'api.organizations',
    'api.population_frame_versions',
    'api.population_frames',
    'api.projects',
    'api.provider_configuration_versions',
    'api.report_artifacts',
    'api.report_exports',
    'api.report_share_grants',
    'api.simulation_configuration_versions',
    'api.simulation_configurations',
    'api.simulation_results',
    'api.simulation_runs',
    'api.stimuli',
    'api.stimulus_assets',
    'api.stimulus_versions',
    'api.stimulus_visual_profiles',
    'api.variant_groups',
    'api.variant_members',
    'private.audit_events',
    'private.behavioral_action_events',
    'private.behavioral_agent_fleets',
    'private.behavioral_agent_memories',
    'private.behavioral_provider_receipts',
    'private.behavioral_result_payloads',
    'private.campaign_evidence_secrets',
    'private.campaign_lab_secrets',
    'private.context_node_embeddings',
    'private.embedding_model_versions',
    'private.idempotency_keys',
    'private.organization_deletion_requests',
    'private.organization_deletion_resources',
    'private.phase4_command_receipts',
    'private.platform_administrators',
    'private.provider_success_receipts',
    'private.queue_transport_control',
    'private.run_attempts',
    'private.run_events',
    'private.run_outbox',
    'private.runtime_controls'
  ]::text[],
  'application table inventory is exact'
);

-- 03
select extensions.ok(
  (
    select pg_catalog.bool_and(relations.relrowsecurity)
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and relations.relkind = 'r'
  ),
  'RLS is enabled on every application table'
);

-- 04
select extensions.ok(
  (
    select pg_catalog.bool_and(relations.relforcerowsecurity)
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and relations.relkind = 'r'
  ),
  'RLS is forced on every application table'
);

-- 05
select extensions.is(
  (
    select pg_catalog.array_agg(policies.policyname order by policies.policyname)
    from pg_catalog.pg_policies as policies
    where policies.schemaname in ('api', 'private')
  ),
  array[
    'audience_versions_api_select',
    'audience_versions_command_phase4_insert',
    'audience_versions_command_select',
    'audiences_api_select',
    'audiences_command_phase4_insert',
    'audiences_command_select',
    'audit_events_campaign_evidence_insert',
    'audit_events_campaign_evidence_worker_insert',
    'audit_events_campaign_lab_command_insert',
    'audit_events_campaign_lab_worker_insert',
    'audit_events_command_cancel_insert',
    'audit_events_command_insert',
    'audit_events_command_phase4_insert',
    'audit_events_command_phase4_select',
    'audit_events_command_sharing_insert',
    'audit_events_command_sign_in_insert',
    'audit_events_worker_control_insert',
    'audit_events_worker_owner_insert',
    'behavioral_action_events_worker_owner_insert',
    'behavioral_action_events_worker_owner_select',
    'behavioral_agent_fleets_worker_owner_insert',
    'behavioral_agent_fleets_worker_owner_select',
    'behavioral_agent_memories_worker_owner_insert',
    'behavioral_agent_memories_worker_owner_select',
    'behavioral_agent_public_summaries_api_select',
    'behavioral_agent_public_summaries_worker_owner_insert',
    'behavioral_agent_public_summaries_worker_owner_select',
    'behavioral_evaluation_members_api_select',
    'behavioral_evaluation_members_command_insert',
    'behavioral_evaluation_members_command_select',
    'behavioral_evaluation_protocol_versions_api_select',
    'behavioral_evaluation_protocol_versions_command_insert',
    'behavioral_evaluation_protocol_versions_command_select',
    'behavioral_evaluation_protocols_api_select',
    'behavioral_evaluation_protocols_command_insert',
    'behavioral_evaluation_protocols_command_select',
    'behavioral_evaluation_runs_api_select',
    'behavioral_evaluation_runs_command_insert',
    'behavioral_evaluation_runs_command_select',
    'behavioral_fleet_summaries_api_select',
    'behavioral_fleet_summaries_worker_owner_insert',
    'behavioral_fleet_summaries_worker_owner_select',
    'behavioral_provider_receipts_worker_owner_insert',
    'behavioral_provider_receipts_worker_owner_select',
    'behavioral_report_evidence_api_select',
    'behavioral_report_evidence_worker_owner_insert',
    'behavioral_report_evidence_worker_owner_select',
    'behavioral_result_payloads_worker_owner_insert',
    'behavioral_result_payloads_worker_owner_select',
    'behavioral_round_summaries_api_select',
    'behavioral_round_summaries_worker_owner_insert',
    'behavioral_round_summaries_worker_owner_select',
    'behavioral_run_results_api_select',
    'behavioral_run_results_command_select',
    'behavioral_run_results_worker_owner_insert',
    'behavioral_run_results_worker_owner_select',
    'campaign_evidence_events_api_select',
    'campaign_evidence_events_worker_insert',
    'campaign_evidence_runs_api_select',
    'campaign_evidence_runs_command_insert',
    'campaign_evidence_runs_command_select',
    'campaign_evidence_runs_command_update',
    'campaign_evidence_runs_worker_delete',
    'campaign_evidence_runs_worker_select',
    'campaign_evidence_runs_worker_update',
    'campaign_evidence_secrets_command_insert',
    'campaign_evidence_secrets_worker_delete',
    'campaign_evidence_secrets_worker_select',
    'campaign_lab_artifacts_api_select',
    'campaign_lab_artifacts_command_insert',
    'campaign_lab_artifacts_command_select',
    'campaign_lab_campaigns_api_select',
    'campaign_lab_campaigns_command_insert',
    'campaign_lab_campaigns_command_select',
    'campaign_lab_campaigns_command_update',
    'campaign_lab_events_api_select',
    'campaign_lab_events_command_insert',
    'campaign_lab_events_command_select',
    'campaign_lab_events_worker_insert',
    'campaign_lab_runs_api_select',
    'campaign_lab_runs_command_insert',
    'campaign_lab_runs_command_select',
    'campaign_lab_runs_worker_select',
    'campaign_lab_runs_worker_update',
    'campaign_lab_secrets_command_insert',
    'campaign_lab_secrets_worker_delete',
    'campaign_lab_secrets_worker_select',
    'context_graph_versions_api_select',
    'context_graph_versions_command_owner_select',
    'context_graph_versions_worker_owner_insert',
    'context_graph_versions_worker_owner_select',
    'context_node_embeddings_command_owner_select',
    'context_node_embeddings_worker_owner_insert',
    'context_node_embeddings_worker_owner_select',
    'embedding_model_versions_command_owner_select',
    'embedding_model_versions_worker_owner_select',
    'evaluation_runs_api_select',
    'evaluation_runs_command_phase4_select',
    'evidence_source_versions_api_select',
    'evidence_source_versions_command_insert',
    'evidence_source_versions_command_select',
    'evidence_sources_api_select',
    'evidence_sources_command_insert',
    'evidence_sources_command_select',
    'feature_flags_api_select',
    'feature_flags_command_insert',
    'feature_flags_command_select',
    'feature_flags_command_update',
    'feedback_records_api_select',
    'feedback_records_command_insert',
    'feedback_records_command_select',
    'idempotency_keys_command_insert',
    'idempotency_keys_command_select',
    'idempotency_keys_command_update',
    'methodology_versions_api_select',
    'methodology_versions_command_phase4_select',
    'observed_outcome_sets_api_select',
    'observed_outcome_sets_command_insert',
    'observed_outcome_sets_command_select',
    'observed_outcome_values_api_select',
    'observed_outcome_values_command_insert',
    'observed_outcome_values_command_select',
    'organization_deletion_requests_command_insert',
    'organization_deletion_requests_command_select',
    'organization_deletion_requests_command_update',
    'organization_deletion_requests_worker_select',
    'organization_deletion_requests_worker_update',
    'organization_deletion_resources_command_delete',
    'organization_deletion_resources_command_insert',
    'organization_deletion_resources_worker_select',
    'organization_deletion_resources_worker_update',
    'organization_invitations_api_select',
    'organization_invitations_command_accept_select',
    'organization_invitations_command_accept_update',
    'organization_invitations_command_insert',
    'organization_invitations_command_select',
    'organization_memberships_api_or_command_select',
    'organization_memberships_command_insert',
    'organization_memberships_command_invitation_insert',
    'organizations_api_select',
    'organizations_command_delete_after_cleanup',
    'organizations_command_delete_after_worker_cleanup',
    'organizations_command_insert',
    'organizations_command_select',
    'organizations_command_select_for_worker_deletion',
    'organizations_command_update_for_deletion',
    'organizations_worker_owner_select',
    'phase4_command_receipts_command_insert',
    'phase4_command_receipts_command_select',
    'phase4_command_receipts_command_update',
    'platform_administrators_command_self_select',
    'population_frame_versions_api_select',
    'population_frame_versions_command_phase4_select',
    'population_frames_api_select',
    'projects_api_select',
    'projects_command_insert',
    'projects_command_select',
    'projects_command_update',
    'provider_configuration_versions_api_select',
    'provider_configuration_versions_command_phase4_select',
    'provider_success_receipts_command_owner_select',
    'provider_success_receipts_worker_owner_insert',
    'provider_success_receipts_worker_owner_select',
    'queue_transport_control_worker_owner_select',
    'report_artifacts_api_select',
    'report_artifacts_command_insert',
    'report_artifacts_command_select',
    'report_exports_api_select',
    'report_exports_command_insert',
    'report_exports_command_select',
    'report_share_grants_api_select',
    'report_share_grants_command_insert',
    'report_share_grants_command_select',
    'report_share_grants_command_update',
    'run_attempts_worker_owner_insert',
    'run_attempts_worker_owner_select',
    'run_attempts_worker_owner_update',
    'run_events_command_cancel_insert',
    'run_events_command_insert',
    'run_events_command_select',
    'run_events_worker_owner_insert',
    'run_outbox_command_insert',
    'run_outbox_worker_owner_recovery_insert',
    'run_outbox_worker_owner_select',
    'run_outbox_worker_owner_update',
    'runtime_controls_worker_owner_select',
    'runtime_controls_worker_owner_update',
    'simulation_configuration_versions_api_select',
    'simulation_configuration_versions_command_insert',
    'simulation_configuration_versions_command_select',
    'simulation_configurations_api_select',
    'simulation_configurations_command_insert',
    'simulation_configurations_command_select',
    'simulation_results_api_select',
    'simulation_results_command_phase4_select',
    'simulation_results_worker_owner_insert',
    'simulation_results_worker_owner_select',
    'simulation_runs_api_select',
    'simulation_runs_command_cancel_update',
    'simulation_runs_command_insert',
    'simulation_runs_command_select',
    'simulation_runs_command_select_for_worker_deletion',
    'simulation_runs_command_trace_update',
    'simulation_runs_worker_owner_select',
    'simulation_runs_worker_owner_update',
    'stimuli_api_select',
    'stimuli_command_insert',
    'stimuli_command_select',
    'stimulus_assets_api_select',
    'stimulus_assets_command_insert',
    'stimulus_assets_command_select',
    'stimulus_assets_command_update',
    'stimulus_versions_api_select',
    'stimulus_versions_command_insert',
    'stimulus_versions_command_select',
    'stimulus_visual_profiles_api_select',
    'stimulus_visual_profiles_command_delete',
    'stimulus_visual_profiles_command_insert',
    'stimulus_visual_profiles_command_select',
    'variant_groups_api_select',
    'variant_groups_command_insert',
    'variant_groups_command_select',
    'variant_members_api_select',
    'variant_members_command_insert',
    'variant_members_command_select'
  ]::name[],
  'RLS policy inventory is exact'
);

-- 06
select extensions.is(
  (
    select pg_catalog.array_agg(roles.rolname order by roles.rolname)
    from pg_catalog.pg_roles as roles
    where roles.rolname like 'simula\_%' escape '\'
  ),
  array[
    'simula_api',
    'simula_command_owner',
    'simula_operator',
    'simula_worker',
    'simula_worker_owner'
  ]::name[],
  'application role inventory is exact'
);

-- 07
select extensions.ok(
  (
    select pg_catalog.bool_and(
      not roles.rolsuper
      and not roles.rolcreatedb
      and not roles.rolcreaterole
      and not roles.rolinherit
      and not roles.rolreplication
      and not roles.rolbypassrls
    )
    from pg_catalog.pg_roles as roles
    where roles.rolname like 'simula\_%' escape '\'
  ),
  'application roles have no elevated attributes and do not inherit'
);

-- 08
select extensions.ok(
  (
    select pg_catalog.bool_and(
      roles.rolcanlogin = (roles.rolname in ('simula_api', 'simula_operator', 'simula_worker'))
    )
    from pg_catalog.pg_roles as roles
    where roles.rolname like 'simula\_%' escape '\'
  ),
  'only runtime roles can login'
);

-- 09
select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_authid as roles
    where roles.rolname like 'simula\_%' escape '\'
      and roles.rolpassword is not null
  ),
  'repository bootstrap leaves application role passwords unset'
);

-- 10
select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_auth_members as memberships
    join pg_catalog.pg_roles as granted_role on granted_role.oid = memberships.roleid
    join pg_catalog.pg_roles as member_role on member_role.oid = memberships.member
    where member_role.rolname in ('simula_api', 'simula_operator', 'simula_worker')
      and granted_role.rolname in ('simula_command_owner', 'simula_worker_owner')
  ),
  'runtime roles cannot assume owner roles'
);

-- 11
select extensions.ok(
  (
    select pg_catalog.bool_and(not memberships.inherit_option)
    from pg_catalog.pg_auth_members as memberships
    join pg_catalog.pg_roles as granted_role on granted_role.oid = memberships.roleid
    join pg_catalog.pg_roles as member_role on member_role.oid = memberships.member
    where member_role.rolname = 'postgres'
      and granted_role.rolname in ('simula_command_owner', 'simula_worker_owner')
      and memberships.set_option
  )
  and (
    select pg_catalog.count(*) = 2
    from pg_catalog.pg_auth_members as memberships
    join pg_catalog.pg_roles as granted_role on granted_role.oid = memberships.roleid
    join pg_catalog.pg_roles as member_role on member_role.oid = memberships.member
    where member_role.rolname = 'postgres'
      and granted_role.rolname in ('simula_command_owner', 'simula_worker_owner')
      and memberships.set_option
  ),
  'migration role receives SET-only owner-role memberships'
);

-- 12
select extensions.ok(
  not exists (
    select 1
    from (values ('anon'), ('authenticated')) as browser_roles(role_name)
    cross join (values ('api'), ('private')) as application_schemas(schema_name)
    where pg_catalog.has_schema_privilege(
      browser_roles.role_name,
      application_schemas.schema_name,
      'USAGE'
    )
  ),
  'browser database roles cannot use application schemas'
);

-- 13
select extensions.ok(
  pg_catalog.has_schema_privilege('simula_api', 'api', 'USAGE')
    and pg_catalog.has_schema_privilege('simula_api', 'private', 'USAGE')
    and not pg_catalog.has_schema_privilege('simula_api', 'api', 'CREATE')
    and not pg_catalog.has_schema_privilege('simula_api', 'private', 'CREATE')
    and not pg_catalog.has_schema_privilege('simula_command_owner', 'api', 'CREATE')
    and not pg_catalog.has_schema_privilege('simula_command_owner', 'private', 'CREATE')
    and not pg_catalog.has_schema_privilege('simula_worker_owner', 'private', 'CREATE'),
  'API, command, and worker-owner roles have resolution-only schema access'
);

-- 14
select extensions.ok(
  pg_catalog.has_schema_privilege('simula_worker', 'private', 'USAGE')
    and not pg_catalog.has_schema_privilege('simula_worker', 'api', 'USAGE')
    and not pg_catalog.has_schema_privilege('simula_worker', 'private', 'CREATE'),
  'worker role reaches only private schema names and cannot create'
);

-- 15
select extensions.ok(
  not exists (
    select 1
    from (values ('anon'), ('authenticated')) as browser_roles(role_name)
    cross join pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and relations.relkind = 'r'
      and pg_catalog.has_table_privilege(browser_roles.role_name, relations.oid, 'SELECT')
  ),
  'browser database roles have no application table reads'
);

-- 16
select extensions.ok(
  (
    select pg_catalog.count(*) = 46
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'api'
      and relations.relkind = 'r'
      and pg_catalog.has_table_privilege('simula_api', relations.oid, 'SELECT')
  )
  and not exists (
    select 1
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'private'
      and relations.relkind = 'r'
      and pg_catalog.has_table_privilege('simula_api', relations.oid, 'SELECT')
  ),
  'API role reads exactly the forty-six named API tables'
);

-- 17
select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and relations.relkind = 'r'
      and (
        pg_catalog.has_table_privilege(
          'simula_api',
          relations.oid,
          'INSERT,DELETE,TRUNCA…7591 tokens truncated…   'get_run_failure_context',
            'get_simulation_run_replay',
            'has_org_role',
            'is_org_member',
             'is_platform_superadmin',
             'provider_success_receipt_for_run',
             'purge_completed_organization_deletion_resources',
             'record_privileged_denial_atomic',
             'record_sign_in_success',
             'release_organization_deletion_resource',
             'request_organization_deletion_atomic',
             'request_run_cancel_atomic',
             'request_stimulus_asset_deletion_atomic',
             'search_context_nodes',
             'seed_organization_deletion_resources',
            'update_project_atomic'
          )
        )
      )
    )
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    join pg_catalog.pg_roles as owner_roles on owner_roles.oid = functions.proowner
    where namespaces.nspname = 'private'
      and functions.proname in (
        'append_stimulus_version_atomic',
        'claim_organization_deletion_resources',
        'complete_organization_deletion_resource',
        'confirm_organization_deletion_atomic',
        'confirm_stimulus_asset_deletion_atomic',
        'confirm_stimulus_asset_upload_atomic',
        'create_behavioral_demo_run_atomic',
        'create_organization_atomic',
        'create_project_atomic',
        'create_simulation_run_atomic',
        'create_simulation_run_traced',
        'create_stimulus_atomic',
        'create_stimulus_asset_atomic',
        'create_stimulus_visual_profile_atomic',
        'finalize_ready_organization_deletions',
        'get_run_audit_history',
        'get_run_failure_context',
        'get_simulation_run_replay',
        'behavioral_result_artifact_is_valid',
        'normalize_behavioral_public_summaries',
        'normalize_behavioral_public_summaries_trigger',
        'normalize_behavioral_result_payload',
        'normalize_behavioral_result_payload_trigger',
        'claim_due_run_outbox',
        'claim_run_execution',
        'claim_run_execution_traced',
        'complete_behavioral_run_execution',
        'complete_run_execution',
        'confirm_run_dispatch',
        'evaluate_run_creation_control',
        'fail_run_dispatch',
        'fail_run_execution',
        'enforce_global_run_backpressure',
        'finalize_poisoned_dispatches',
        'finalize_requested_cancellations',
        'heartbeat_run_execution',
        'provider_success_receipt_for_run',
        'purge_completed_organization_deletion_resources',
        'reconcile_run_dispatch',
        'release_organization_deletion_resource',
        'runtime_observability_snapshot',
        'runtime_schema_readiness',
        'search_context_nodes',
        'seed_organization_deletion_resources',
        'upsert_context_node_embedding',
        'has_org_role',
        'is_org_member',
        'is_platform_superadmin',
        'is_verified_api_subject',
        'platform_user_count',
        'record_privileged_denial_atomic',
        'record_sign_in_success',
        'request_organization_deletion_atomic',
        'request_run_cancel_atomic',
        'request_stimulus_asset_deletion_atomic',
        'update_project_atomic',
        'verified_subject'
      )
  ),
  'private authorization, command, and worker helpers have exact owners and definer modes'
);

-- 24
select extensions.ok(
  (
    select pg_catalog.bool_and(not functions.prosecdef)
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    where namespaces.nspname = 'api'
  ),
  'API wrappers are security invokers'
);

-- 25
select extensions.ok(
  (
    select pg_catalog.bool_and(
      functions.proconfig @> array['search_path=""']::text[]
    )
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    where namespaces.nspname in ('api', 'private')
  ),
  'every application function fixes an empty search path'
);

-- 26
select extensions.ok(
  (
    select pg_catalog.bool_and(
      functions.proconfig @> array['row_security=on']::text[]
    )
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    where namespaces.nspname = 'private'
      and functions.prosecdef
  ),
  'every security-definer helper forces row security on'
);

-- 27
select extensions.is(
  (
    select pg_catalog.array_agg(triggers.tgname order by triggers.tgname)
    from pg_catalog.pg_trigger as triggers
    join pg_catalog.pg_class as relations on relations.oid = triggers.tgrelid
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and not triggers.tgisinternal
  ),
  array[
    'audience_versions_content_immutable',
    'audience_versions_organization_guard',
    'behavioral_evaluation_protocol_versions_guard',
    'behavioral_evaluation_runs_scope_guard',
    'behavioral_result_payload_normalize',
    'behavioral_result_payload_public_summary',
    'campaign_evidence_outcome_project_scope_guard',
    'campaign_evidence_runs_scope_guard',
    'evidence_source_versions_scope_guard',
    'observed_outcome_sets_rights_guard',
    'population_frame_versions_scope_guard',
    'purge_completed_organization_deletion_resources',
    'purge_stimulus_visual_profile_on_asset_retirement',
    'report_artifacts_campaign_evidence_guard',
    'seed_organization_deletion_resources',
    'simulation_runs_audience_guard',
    'simulation_runs_global_backpressure_before_insert'
  ]::name[],
  'tenant-scope and global-admission trigger inventory is exact'
);

-- 28
select extensions.is(
  (
    select pg_catalog.array_agg(constraints.conname order by constraints.conname)
    from pg_catalog.pg_constraint as constraints
    join pg_catalog.pg_class as relations on relations.oid = constraints.conrelid
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname in ('api', 'private')
      and constraints.contype = 'f'
      and pg_catalog.array_length(constraints.conkey, 1) = 2
  ),
  array[
    'behavioral_action_events_run_foreign_key',
    'behavioral_agent_fleets_run_foreign_key',
    'behavioral_agent_memories_run_foreign_key',
    'behavioral_agent_public_summaries_run_foreign_key',
    'behavioral_evaluation_members_behavioral_run_foreign_key',
    'behavioral_evaluation_members_evaluation_foreign_key',
    'behavioral_evaluation_members_outcome_foreign_key',
    'behavioral_evaluation_runs_outcome_set_foreign_key',
    'behavioral_fleet_summaries_run_foreign_key',
    'behavioral_provider_receipts_run_foreign_key',
    'behavioral_report_evidence_run_foreign_key',
    'behavioral_result_payloads_result_foreign_key',
    'behavioral_round_summaries_run_foreign_key',
    'behavioral_run_results_run_foreign_key',
    'campaign_evidence_events_run_foreign_key',
    'campaign_evidence_runs_outcome_foreign_key',
    'campaign_evidence_runs_project_foreign_key',
    'campaign_evidence_runs_source_foreign_key',
    'campaign_evidence_secrets_run_foreign_key',
    'campaign_lab_artifacts_campaign_foreign_key',
    'campaign_lab_campaigns_project_foreign_key',
    'campaign_lab_events_artifact_foreign_key',
    'campaign_lab_events_campaign_foreign_key',
    'campaign_lab_events_run_foreign_key',
    'campaign_lab_runs_campaign_foreign_key',
    'campaign_lab_secrets_artifact_foreign_key',
    'campaign_lab_secrets_run_foreign_key',
    'context_graph_versions_run_foreign_key',
    'context_node_embeddings_graph_foreign_key',
    'evaluation_runs_configuration_foreign_key',
    'feedback_records_run_foreign_key',
    'observed_outcome_sets_project_foreign_key',
    'observed_outcome_values_set_foreign_key',
    'provider_success_receipts_run_foreign_key',
    'report_artifacts_run_foreign_key',
    'report_exports_report_foreign_key',
    'report_share_grants_recipient_foreign_key',
    'report_share_grants_report_foreign_key',
    'run_attempts_run_foreign_key',
    'run_events_run_foreign_key',
    'run_outbox_run_foreign_key',
    'simulation_configuration_versions_config_foreign_key',
    'simulation_configurations_project_foreign_key',
    'simulation_results_run_foreign_key',
    'simulation_runs_project_foreign_key',
    'simulation_runs_stimulus_version_foreign_key',
    'stimuli_project_foreign_key',
    'stimulus_assets_stimulus_foreign_key',
    'stimulus_versions_stimulus_foreign_key',
    'variant_groups_project_foreign_key',
    'variant_members_group_foreign_key',
    'variant_members_stimulus_version_foreign_key'
  ]::name[],
  'composite tenant foreign-key inventory is exact'
);

-- 29
select extensions.is(
  (
    select pg_catalog.array_agg(types.typname order by types.typname)
    from pg_catalog.pg_type as types
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = types.typnamespace
    where namespaces.nspname in ('api', 'private')
      and types.typtype = 'e'
  ),
  array[
    'attempt_status',
    'audience_admission_status',
    'audience_kind',
    'audit_actor_type',
    'evaluation_status',
    'export_format',
    'feedback_kind',
    'invitation_status',
    'organization_role',
    'organization_status',
    'outbox_status',
    'project_status',
    'provider_admission_status',
    'run_state',
    'share_permission',
    'stimulus_status',
    'validation_status'
  ]::name[],
  'application enum inventory is exact'
);

-- 30
select extensions.is(
  (
    select pg_catalog.array_agg(users.id::text || '|' || users.email order by users.id)
    from auth.users as users
    where users.id in (
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      '00000000-0000-4000-8000-000000000003'::uuid
    )
      and users.email_confirmed_at is not null
  ),
  array[
    '00000000-0000-4000-8000-000000000001|owner-a@simula.local',
    '00000000-0000-4000-8000-000000000002|viewer-a@simula.local',
    '00000000-0000-4000-8000-000000000003|owner-b@simula.local'
  ]::text[],
  'authored local Auth fixtures are exact and confirmed'
);

-- 31
select extensions.ok(
  (
    select pg_catalog.count(*) = 3
    from auth.identities as identities
    where identities.user_id in (
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      '00000000-0000-4000-8000-000000000003'::uuid
    )
      and identities.provider = 'email'
      and identities.identity_data ->> 'email' = identities.email
  ),
  'each Auth fixture has one generated-email identity'
);

-- 32
select extensions.ok(
  (
    (select pg_catalog.count(*) from api.organizations)
    + (select pg_catalog.count(*) from api.organization_memberships)
    + (select pg_catalog.count(*) from api.projects)
    + (select pg_catalog.count(*) from api.stimuli)
    + (select pg_catalog.count(*) from api.stimulus_versions)
    + (select pg_catalog.count(*) from api.audiences where id <> '00000000-0000-4000-8000-0000000000d0'::uuid)
    + (
      select pg_catalog.count(*)
      from api.audience_versions
      where id not in (
        '00000000-0000-4000-8000-0000000000d1'::uuid,
        '00000000-0000-4000-8000-0000000000d2'::uuid
      )
    )
    + (select pg_catalog.count(*) from api.simulation_runs)
    + (select pg_catalog.count(*) from api.simulation_results)
    + (
      select pg_catalog.count(*)
      from api.population_frames
      where id <> '00000000-0000-4000-8000-0000000003f0'::uuid
    )
    + (
      select pg_catalog.count(*)
      from api.population_frame_versions
      where id <> '00000000-0000-4000-8000-0000000003f1'::uuid
    )
    + (select pg_catalog.count(*) from api.simulation_configurations)
    + (select pg_catalog.count(*) from api.simulation_configuration_versions)
    + (select pg_catalog.count(*) from api.evaluation_runs)
    + (select pg_catalog.count(*) from api.feature_flags)
    + (select pg_catalog.count(*) from api.feedback_records)
    + (select pg_catalog.count(*) from api.organization_invitations)
    + (select pg_catalog.count(*) from api.report_artifacts)
    + (select pg_catalog.count(*) from api.report_exports)
    + (select pg_catalog.count(*) from api.report_share_grants)
    + (select pg_catalog.count(*) from api.variant_groups)
    + (select pg_catalog.count(*) from api.variant_members)
    + (select pg_catalog.count(*) from private.run_attempts)
    + (select pg_catalog.count(*) from private.run_events)
    + (select pg_catalog.count(*) from private.run_outbox)
    + (select pg_catalog.count(*) from private.provider_success_receipts)
    + (select pg_catalog.count(*) from private.idempotency_keys)
    + (select pg_catalog.count(*) from private.phase4_command_receipts)
    + (select pg_catalog.count(*) from private.audit_events)
    + (select pg_catalog.count(*) from private.context_node_embeddings)
    + (select pg_catalog.count(*) from private.embedding_model_versions)
  ) = 0
  and exists (
    select 1
    from api.population_frames as frames
    join api.population_frame_versions as versions
      on versions.population_frame_id = frames.id
    where frames.id = '00000000-0000-4000-8000-0000000003f0'::uuid
      and frames.organization_id is null
      and frames.validation_status = 'experimental'
      and versions.id = '00000000-0000-4000-8000-0000000003f1'::uuid
      and versions.organization_id is null
      and versions.validation_status = 'experimental'
      and versions.manifest ->> 'kind' = 'authored_demo'
      and versions.manifest ->> 'target_population'
        = 'No real population; authored engineering fixture only.'
      and pg_catalog.jsonb_array_length(versions.manifest -> 'cells') = 4
      and versions.checksum_sha256 = pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(versions.manifest::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      )
  )
  and exists (
    select 1
    from api.methodology_versions as methods
    where methods.id = '00000000-0000-4000-8000-0000000003a1'::uuid
      and methods.methodology_key = 'phase3_method_v1'
      and methods.version = 1
      and methods.validation_status = 'experimental'
      and methods.manifest -> 'response_schema_version' = '2'::jsonb
      and methods.checksum_sha256 = pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(methods.manifest::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      )
  )
  and exists (
    select 1
    from api.provider_configuration_versions as providers
    where providers.id = '00000000-0000-4000-8000-0000000003b1'::uuid
      and providers.provider_id = 'deterministic_cohort'
      and providers.admission_status = 'approved_demo'
      and not providers.external_provider
      and providers.limits -> 'maximum_cost_microusd' = '0'::jsonb
  )
  and 2 = (
    select pg_catalog.count(*)
    from api.audience_versions as versions
    where versions.audience_id = '00000000-0000-4000-8000-0000000000d0'::uuid
      and versions.organization_id is null
      and versions.kind = 'authored_demo'
  )
  and 1 = (
    select pg_catalog.count(*)
    from api.audience_versions as versions
    where versions.audience_id = '00000000-0000-4000-8000-0000000000d0'::uuid
      and versions.organization_id is null
      and versions.kind = 'authored_demo'
      and versions.admission_status = 'approved_demo'
  )
  and exists (
    select 1
    from api.audience_versions as versions
    where versions.id = '00000000-0000-4000-8000-0000000000d1'::uuid
      and versions.version = 1
      and versions.admission_status = 'revoked'
      and versions.checksum_sha256 =
        'a311857242b4b3979199db4007b1c0d775a9abdf457d7bb119c7fae63c9c0586'
  )
  and exists (
    select 1
    from api.audiences as audiences
    join api.audience_versions as versions on versions.audience_id = audiences.id
    where audiences.id = '00000000-0000-4000-8000-0000000000d0'::uuid
      and audiences.organization_id is null
      and audiences.is_public_demo
      and versions.id = '00000000-0000-4000-8000-0000000000d2'::uuid
      and versions.version = 2
      and versions.organization_id is null
      and versions.kind = 'authored_demo'
      and versions.admission_status = 'approved_demo'
      and versions.is_non_representative
      and versions.manifest ?& array[
        'audience_cells',
        'authoring_date',
        'category_scope',
        'checksum_algorithm',
        'checksum_canonicalization',
        'dependencies',
        'disclosure_version',
        'estimates_nobody',
        'external_dependencies',
        'kind',
        'language_scope',
        'lifecycle',
        'method_version',
        'non_representative',
        'owner',
        'prohibited_uses',
        'purpose',
        'record_count',
        'retention_state',
        'retirement_state',
        'schema_version',
        'semantic_version',
        'scope',
        'source',
        'source_type',
        'stable_id',
        'transformation',
        'transformation_code_version'
      ]
      and versions.checksum_sha256 =
        'ec5a2cda8f71f55e15b9c0be31a03c19e39f0c47c911898c1b49b33d3ea14e6e'
      and versions.manifest ->> 'semantic_version' = '2.0.0'
      and versions.manifest ->> 'source_type' = 'internal_authored'
      and versions.manifest -> 'external_dependencies' = '[]'::jsonb
      and versions.manifest ->> 'retirement_state' = 'active'
  ),
  'only governed global demo fixtures are seeded; tenant, evaluation, and run data remain empty'
);

-- 33
select extensions.throws_ok(
  $sql$
    update api.audience_versions
    set manifest = manifest || '{"unauthorized_change": true}'::jsonb
    where id = '00000000-0000-4000-8000-0000000000d2'::uuid
  $sql$,
  '55000',
  'audience_version_content_immutable',
  'demo audience version content cannot be changed in place'
);

-- 34
select extensions.throws_ok(
  $sql$
    do $adversarial$
    begin
      insert into api.audiences (
        id, organization_id, name, is_public_demo, created_by
      ) values (
        '00000000-0000-4000-8000-0000000000e0'::uuid,
        null,
        'Second global demo',
        true,
        null
      );
      insert into api.audience_versions (
        id, organization_id, audience_id, version, kind, admission_status,
        manifest, checksum_sha256, is_non_representative, limitations
      )
      select
        '00000000-0000-4000-8000-0000000000e1'::uuid,
        null,
        '00000000-0000-4000-8000-0000000000e0'::uuid,
        1,
        kind,
        admission_status,
        manifest,
        checksum_sha256,
        is_non_representative,
        limitations
      from api.audience_versions
      where id = '00000000-0000-4000-8000-0000000000d2'::uuid;
    end
    $adversarial$
  $sql$,
  '23505',
  'duplicate key value violates unique constraint "audience_versions_one_active_global_demo_idx"',
  'only one active global authored demo version exists across every audience'
);

-- 35
select extensions.is(
  (
    select pg_catalog.array_agg(
      functions.oid::pg_catalog.regprocedure::text
      order by functions.oid::pg_catalog.regprocedure::text
    )
    from pg_catalog.pg_proc as functions
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
    where namespaces.nspname in ('api', 'private')
      and pg_catalog.has_function_privilege('simula_operator', functions.oid, 'EXECUTE')
  ),
  array[
    'private.get_queue_transport_control()',
    'private.get_run_creation_control()',
    'private.set_queue_transport(text,uuid)',
    'private.set_run_creation_control(boolean,text,uuid)'
  ]::text[],
  'operator role can execute only the four run and queue control functions'
);

select * from extensions.finish();
rollback;

