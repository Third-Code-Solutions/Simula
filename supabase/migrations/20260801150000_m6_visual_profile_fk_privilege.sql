-- The command owner inserts visual profiles through the security-definer
-- command. PostgreSQL still checks the asset foreign key under that owner.

set role postgres;
grant references
on table api.stimulus_assets
to simula_command_owner;
set role postgres;
