-- P2-06 migration paths required temporary owner-schema CREATE capabilities.
-- Neither capability may persist after the migration completes.
revoke create on schema api from simula_command_owner;
revoke create on schema private from simula_command_owner;
