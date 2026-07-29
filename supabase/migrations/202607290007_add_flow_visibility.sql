create type public.flow_visibility as enum ('public', 'unlisted');

alter table public.flows
  add column visibility public.flow_visibility not null default 'public';

create index flows_public_catalog_idx
  on public.flows(updated_at desc)
  where status = 'published' and visibility = 'public';

comment on column public.flows.visibility is
  'public flows appear in the portal; unlisted flows are available only through their public URL.';
