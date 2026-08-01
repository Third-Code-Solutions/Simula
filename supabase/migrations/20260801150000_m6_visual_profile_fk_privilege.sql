-- PostgreSQL's referential-integrity trigger checks the referenced row with
-- FOR KEY SHARE under the API invoker. That lock requires UPDATE privilege.
-- Keep it column-scoped to the immutable primary key; forced RLS and the lack
-- of an API UPDATE policy still prevent direct asset writes.

set role postgres;
grant update (id)
on table api.stimulus_assets
to simula_api;
set role postgres;
