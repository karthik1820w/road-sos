-- Incident persistence (Feature 2). Optional: the API runs in-memory when Supabase is not configured.
create table if not exists incidents (
  id uuid primary key,
  state text not null,
  kind text not null,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null
);
create index if not exists incidents_state_idx on incidents (state);
create index if not exists incidents_updated_idx on incidents (updated_at desc);
-- Optional PostGIS for geo queries (responder console): 
-- create extension if not exists postgis; alter table incidents add column geom geography(Point,4326);

-- SECURITY: `payload` contains patient name, phone number, medical conditions and precise
-- GPS coordinates. This table is only ever written to and read from by the API server using
-- the SUPABASE_SERVICE_ROLE_KEY (see api/incidents.ts: SupabaseMirroredStore), which bypasses
-- RLS by design — so enabling RLS here costs the server nothing. Without it, if this project's
-- SUPABASE_ANON_KEY is ever used anywhere (client-side or otherwise), PostgREST's default
-- grants would make every incident's full payload readable by anyone with that anon key.
-- Enabling RLS with zero policies below denies all access to the anon/authenticated roles
-- while leaving the service role unaffected.
alter table incidents enable row level security;
-- Intentionally no policies: this table has no legitimate direct client access path.
-- All reads/writes go through the API server (service role) or the authenticated,
-- device-token-checked /api/incidents/* routes in api/incidents.ts.

-- app_users: email/password auth (api/auth.ts). Not currently wired into the client UI,
-- but stores password hashes and PII, so it gets the same RLS treatment as `incidents`.
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  is_verified boolean not null default false,
  verification_token text,
  reset_token text,
  reset_token_expires timestamptz,
  created_at timestamptz not null default now()
);
alter table app_users enable row level security;
-- Intentionally no policies: only accessed server-side via SUPABASE_SERVICE_ROLE_KEY.
