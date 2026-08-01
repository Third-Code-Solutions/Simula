-- Preserve every durable Phase 4 command scope when later migrations extend
-- the receipt table. Earlier M6 scope rewrites accidentally dropped invitation
-- acceptance and report sharing scopes from this check constraint.
alter table private.phase4_command_receipts
  drop constraint phase4_command_receipts_scope_valid,
  add constraint phase4_command_receipts_scope_valid check (
    scope in (
      'audience.create',
      'simulation_configuration.create',
      'variant_group.create',
      'report.create',
      'export.create',
      'feedback.create',
      'invitation.create',
      'invitation.accept',
      'share.create',
      'share.revoke',
      'feature_flag.set',
      'stimulus_asset.reserve',
      'stimulus_asset.delete',
      'stimulus_visual_profile.create'
    )
  );

set role postgres;
