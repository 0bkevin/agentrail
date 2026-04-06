create table if not exists agentrail_orders (
  id text primary key,
  created_at bigint not null,
  updated_at bigint not null,
  status text not null,
  buyer text not null,
  provider_id text not null,
  data jsonb not null
);

create index if not exists agentrail_orders_created_at_idx
  on agentrail_orders (created_at desc);

create table if not exists agentrail_proposals (
  id text primary key,
  created_at bigint not null,
  data jsonb not null
);

create table if not exists agentrail_terminal_entries (
  id text primary key,
  created_at bigint not null,
  data jsonb not null
);

create index if not exists agentrail_terminal_entries_created_at_idx
  on agentrail_terminal_entries (created_at desc);

create table if not exists agentrail_providers (
  id text primary key,
  wallet_address text not null,
  name text not null,
  role_label text not null,
  service_types jsonb not null,
  trust_model text not null,
  verification_mode text not null,
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists agentrail_proofs (
  id text primary key,
  order_id text not null,
  proof_type text not null,
  payload_json jsonb not null,
  signature text not null,
  proof_hash text not null,
  verified_boolean boolean not null,
  verified_at bigint not null,
  created_at bigint not null
);

create index if not exists agentrail_proofs_order_idx
  on agentrail_proofs (order_id);

create table if not exists agentrail_disputes (
  id text primary key,
  order_id text not null,
  opened_by text not null,
  reason text not null,
  status text not null,
  resolution text,
  created_at bigint not null,
  updated_at bigint not null
);

create index if not exists agentrail_disputes_order_idx
  on agentrail_disputes (order_id);

create table if not exists agentrail_audit_logs (
  id text primary key,
  order_id text not null,
  source text not null,
  event_type text not null,
  payload_json jsonb not null,
  created_at bigint not null
);

create index if not exists agentrail_audit_logs_order_idx
  on agentrail_audit_logs (order_id, created_at desc);

create table if not exists agentrail_sync_state (
  key text primary key,
  block_number text not null,
  updated_at bigint not null
);

create table if not exists agentrail_auth_challenges (
  address text primary key,
  expires_at bigint not null,
  data jsonb not null
);

create index if not exists agentrail_auth_challenges_expires_at_idx
  on agentrail_auth_challenges (expires_at);

create table if not exists agentrail_auth_sessions (
  token text primary key,
  address text not null,
  expires_at bigint not null
);

create index if not exists agentrail_auth_sessions_expires_at_idx
  on agentrail_auth_sessions (expires_at);
