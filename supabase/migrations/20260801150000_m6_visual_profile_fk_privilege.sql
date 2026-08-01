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
set role postgres;
