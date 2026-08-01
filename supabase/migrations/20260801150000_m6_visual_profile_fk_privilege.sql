-- PostgreSQL's referential-integrity trigger checks the referenced row with
-- FOR KEY SHARE under the API invoker. That lock requires UPDATE privilege.
-- The RI check requires the table-level form of that privilege. Forced RLS
-- and the lack of an API UPDATE policy still prevent direct asset writes.

set role postgres;
grant update
on table api.stimulus_assets
to simula_api;
set role postgres;
