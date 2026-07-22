begin;

set local lock_timeout = '2s';
set local statement_timeout = '8s';

set role postgres;

create index platform_administrators_granted_by_idx
on private.platform_administrators (granted_by);

commit;
