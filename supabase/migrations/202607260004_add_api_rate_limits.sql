create table public.api_rate_limit_buckets (
  action text not null,
  identifier_hash text not null check (identifier_hash ~ '^[0-9a-f]{64}$'),
  window_seconds integer not null check (window_seconds between 1 and 86400),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  expires_at timestamptz not null,
  primary key (action, identifier_hash, window_seconds, window_started_at)
);

create index api_rate_limit_buckets_expiry_idx
  on public.api_rate_limit_buckets (expires_at);

alter table public.api_rate_limit_buckets enable row level security;
revoke all on public.api_rate_limit_buckets from public, anon, authenticated;

create function public.consume_api_rate_limit(
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
  if p_action not in ('create-flow', 'generate-sql') then
    raise exception 'Unsupported rate-limit action';
  end if;
  if p_identifier_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rate-limit identifier';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit window';
  end if;
  if p_max_requests < 1 or p_max_requests > 100000 then
    raise exception 'Invalid rate-limit maximum';
  end if;

  v_bucket_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.api_rate_limit_buckets (
    action,
    identifier_hash,
    window_seconds,
    window_started_at,
    request_count,
    expires_at
  ) values (
    p_action,
    p_identifier_hash,
    p_window_seconds,
    v_bucket_start,
    1,
    v_bucket_start + make_interval(secs => p_window_seconds * 2)
  )
  on conflict (action, identifier_hash, window_seconds, window_started_at)
  do update set
    request_count = public.api_rate_limit_buckets.request_count + 1,
    expires_at = excluded.expires_at
  returning request_count into v_count;

  v_retry_after := greatest(
    1,
    ceil(extract(epoch from (
      v_bucket_start + make_interval(secs => p_window_seconds) - v_now
    )))::integer
  );

  -- Abandoned identifiers are removed opportunistically, without requiring pg_cron.
  if random() < 0.01 then
    delete from public.api_rate_limit_buckets where expires_at < v_now;
  end if;

  return query select
    v_count <= p_max_requests,
    greatest(p_max_requests - v_count, 0),
    case when v_count <= p_max_requests then 0 else v_retry_after end;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer)
  to service_role;

comment on table public.api_rate_limit_buckets is
  'Short-lived anonymous API counters. Identifiers are HMAC hashes; raw IP addresses are never stored.';

