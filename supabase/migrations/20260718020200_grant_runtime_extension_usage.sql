-- SECURITY DEFINER runtime functions call the pinned pgcrypto digest function
-- through the extensions schema.  Schema USAGE is required in addition to the
-- function EXECUTE privilege; it grants no table or object-creation authority.
grant usage on schema extensions to simula_command_owner, simula_worker_owner;
