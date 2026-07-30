create table public.flow_usage_daily (
  process_key text not null check (process_key ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  usage_date date not null default current_date,
  successful_runs bigint not null default 0 check (successful_runs >= 0),
  primary key (process_key, usage_date)
);

create table public.flow_usage_receipts (
  event_id uuid primary key,
  created_at timestamptz not null default now()
);

create index flow_usage_daily_date_idx on public.flow_usage_daily (usage_date);
create index flow_usage_receipts_created_idx on public.flow_usage_receipts (created_at);

alter table public.flow_usage_daily enable row level security;
alter table public.flow_usage_receipts enable row level security;
revoke all on public.flow_usage_daily, public.flow_usage_receipts from public, anon, authenticated;
grant select, insert, update, delete on public.flow_usage_daily, public.flow_usage_receipts to service_role;

create function public.record_flow_usage(p_event_id uuid, p_process_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_rows integer;
begin
  if p_process_key !~ '^[a-z0-9][a-z0-9-]{0,99}$' then
    raise exception 'Invalid process key';
  end if;

  insert into public.flow_usage_receipts (event_id) values (p_event_id)
  on conflict (event_id) do nothing;
  get diagnostics inserted_rows = row_count;
  if inserted_rows = 0 then return false; end if;

  insert into public.flow_usage_daily (process_key, usage_date, successful_runs)
  values (p_process_key, current_date, 1)
  on conflict (process_key, usage_date)
  do update set successful_runs = public.flow_usage_daily.successful_runs + 1;

  if random() < 0.01 then
    delete from public.flow_usage_receipts where created_at < now() - interval '7 days';
  end if;
  return true;
end;
$$;

create function public.flow_usage_counts(requested_keys text[])
returns table (process_key text, total_runs bigint, recent_runs bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select requested.process_key,
    coalesce(sum(daily.successful_runs), 0)::bigint as total_runs,
    coalesce(sum(daily.successful_runs) filter (where daily.usage_date >= current_date - 29), 0)::bigint as recent_runs
  from unnest(requested_keys) as requested(process_key)
  left join public.flow_usage_daily as daily on daily.process_key = requested.process_key
  group by requested.process_key;
$$;

revoke all on function public.record_flow_usage(uuid, text) from public, anon, authenticated;
revoke all on function public.flow_usage_counts(text[]) from public, anon, authenticated;
grant execute on function public.record_flow_usage(uuid, text) to service_role;
grant execute on function public.flow_usage_counts(text[]) to service_role;

create or replace function public.consume_api_rate_limit(
  p_action text,
  p_identifier_hash text,
  p_window_seconds integer,
  p_max_requests integer
) returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_bucket_start timestamptz;
  v_count integer;
  v_retry_after integer;
begin
  if p_action not in ('create-flow', 'generate-sql', 'flow-usage') then
    raise exception 'Unsupported rate-limit action';
  end if;
  if p_identifier_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid rate-limit identifier'; end if;
  if p_window_seconds < 1 or p_window_seconds > 86400 then raise exception 'Invalid rate-limit window'; end if;
  if p_max_requests < 1 or p_max_requests > 100000 then raise exception 'Invalid rate-limit maximum'; end if;

  v_bucket_start := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);
  insert into public.api_rate_limit_buckets (action, identifier_hash, window_seconds, window_started_at, request_count, expires_at)
  values (p_action, p_identifier_hash, p_window_seconds, v_bucket_start, 1, v_bucket_start + make_interval(secs => p_window_seconds * 2))
  on conflict (action, identifier_hash, window_seconds, window_started_at)
  do update set request_count = public.api_rate_limit_buckets.request_count + 1, expires_at = excluded.expires_at
  returning request_count into v_count;

  v_retry_after := greatest(1, ceil(extract(epoch from (v_bucket_start + make_interval(secs => p_window_seconds) - v_now)))::integer);
  if random() < 0.01 then delete from public.api_rate_limit_buckets where expires_at < v_now; end if;
  return query select v_count <= p_max_requests, greatest(p_max_requests - v_count, 0), case when v_count <= p_max_requests then 0 else v_retry_after end;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role;

comment on table public.flow_usage_daily is 'Daily aggregate of successful executions across all users.';
comment on table public.flow_usage_receipts is 'Short-lived idempotency receipts; no user or input data is stored.';
