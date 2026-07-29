alter table public.flows
  add column owner_user_id uuid references auth.users(id) on delete set null;

alter table public.flow_versions
  add column updated_by_name text
  check (updated_by_name is null or char_length(updated_by_name) between 1 and 160);

create index flows_owner_user_id_idx on public.flows(owner_user_id);

create table public.flow_samples (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null,
  version_number integer not null,
  input_id text not null check (char_length(input_id) between 1 and 100),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 180),
  content_type text not null check (char_length(content_type) between 1 and 120),
  byte_size integer not null check (byte_size between 1 and 5242880),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (flow_id, version_number, input_id),
  foreign key (flow_id, version_number)
    references public.flow_versions(flow_id, version_number)
    on delete cascade
);

create index flow_samples_current_lookup_idx
  on public.flow_samples(flow_id, version_number, input_id);

alter table public.flow_samples enable row level security;
revoke all on public.flow_samples from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'flow-samples',
  'flow-samples',
  false,
  5242880,
  array[
    'text/csv',
    'application/csv',
    'application/json',
    'text/json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on table public.flow_samples is
  'Metadata for optional public-flow sample files. File bytes are stored in the private flow-samples Storage bucket.';
