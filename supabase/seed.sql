-- Authored local-only identities. Never use these credentials outside disposable local/CI.
with fixture_users (id, email) as (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'owner-a@simula.local'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'viewer-a@simula.local'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'owner-b@simula.local')
)
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  phone,
  phone_change,
  phone_change_token,
  email_change_token_current,
  email_change_confirm_status,
  reauthentication_token,
  is_sso_user,
  is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  fixture_users.id,
  'authenticated',
  'authenticated',
  fixture_users.email,
  extensions.crypt('SimulaLocalOnly!2026', extensions.gen_salt('bf')),
  pg_catalog.statement_timestamp(),
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  false,
  pg_catalog.statement_timestamp(),
  pg_catalog.statement_timestamp(),
  null,
  '',
  '',
  '',
  0,
  '',
  false,
  false
from fixture_users;

with fixture_users (id, email) as (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'owner-a@simula.local'),
    ('00000000-0000-4000-8000-000000000002'::uuid, 'viewer-a@simula.local'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'owner-b@simula.local')
)
insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  fixture_users.id,
  fixture_users.id::text,
  fixture_users.id,
  pg_catalog.jsonb_build_object(
    'sub', fixture_users.id::text,
    'email', fixture_users.email,
    'email_verified', true
  ),
  'email',
  pg_catalog.statement_timestamp(),
  pg_catalog.statement_timestamp(),
  pg_catalog.statement_timestamp()
from fixture_users;

-- P2-02 intentionally seeds no organization or customer/domain content.
