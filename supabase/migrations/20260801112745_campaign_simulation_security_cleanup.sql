-- Remove the temporary DDL privileges used to install the evidence trigger.
-- Runtime API roles retain only the existing report-artifact read/command
-- boundaries; the trigger remains owned by simula_command_owner.

set role postgres;
set role simula_command_owner;

revoke trigger on table api.report_artifacts from simula_command_owner;
revoke create on schema private from simula_command_owner;

reset role;
set role postgres;
