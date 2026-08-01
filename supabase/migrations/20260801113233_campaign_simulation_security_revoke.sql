-- The migration runner uses the postgres role for schema ownership changes.
-- Revoke the temporary installer privileges after the trigger is in place.

set role postgres;

revoke trigger on table api.report_artifacts from simula_command_owner;
revoke create on schema private from simula_command_owner;

set role postgres;
