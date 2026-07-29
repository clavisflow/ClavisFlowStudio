create table public.flow_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  process_key text not null check (process_key ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  active boolean not null default true,
  client_updated_at bigint not null check (client_updated_at between 1 and 4102444800000),
  name text not null default '' check (char_length(name) <= 120),
  description text not null default '' check (char_length(description) <= 2000),
  href text not null default '' check (char_length(href) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, process_key)
);

create index flow_favorites_active_process_idx
  on public.flow_favorites(process_key)
  where active;

create trigger flow_favorites_touch_updated_at before update on public.flow_favorites
for each row execute function public.touch_updated_at();

alter table public.flow_favorites enable row level security;
revoke all on public.flow_favorites from anon, authenticated;
grant select, insert, update, delete on public.flow_favorites to service_role;

create function public.flow_favorite_counts(requested_keys text[])
returns table (process_key text, favorite_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select favorite.process_key, count(*)::bigint
  from public.flow_favorites as favorite
  where favorite.active
    and favorite.process_key = any(requested_keys)
  group by favorite.process_key;
$$;

revoke all on function public.flow_favorite_counts(text[]) from public, anon, authenticated;
grant execute on function public.flow_favorite_counts(text[]) to service_role;

comment on table public.flow_favorites is
  'Per-user favorite state. Inactive rows are retained as synchronization tombstones.';
