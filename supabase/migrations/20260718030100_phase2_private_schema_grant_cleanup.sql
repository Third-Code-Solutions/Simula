-- Earlier hosted migration execution retained temporary owner CREATE grants.
-- These owners may execute only their named routines after this cleanup.

revoke create on schema private from simula_command_owner;
revoke create on schema private from simula_worker_owner;
