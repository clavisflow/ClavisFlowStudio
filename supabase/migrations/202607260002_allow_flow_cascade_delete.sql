create or replace function public.protect_published_flow_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if old.published_at is not null then
    raise exception 'Published flow versions are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
