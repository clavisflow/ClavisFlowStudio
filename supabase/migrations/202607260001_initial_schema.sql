create extension if not exists pgcrypto with schema extensions;

create type public.flow_status as enum ('draft', 'published', 'unpublished');

create table public.flows (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^[a-z0-9][a-z0-9-]{7,63}$'),
  edit_token_hash text not null check (length(edit_token_hash) = 64),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  status public.flow_status not null default 'draft',
  current_published_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.flow_versions (
  id bigint generated always as identity primary key,
  flow_id uuid not null references public.flows(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  input_definition jsonb not null check (jsonb_typeof(input_definition) = 'array'),
  sql text not null check (char_length(sql) between 1 and 50000),
  output_definition jsonb not null check (jsonb_typeof(output_definition) = 'object'),
  duckdb_version text not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (flow_id, version_number)
);

alter table public.flows
  add constraint flows_current_version_fk
  foreign key (id, current_published_version)
  references public.flow_versions(flow_id, version_number)
  deferrable initially deferred;

create index flow_versions_flow_id_idx on public.flow_versions(flow_id, version_number desc);
create index flows_public_lookup_idx on public.flows(public_id) where status = 'published';

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger flows_touch_updated_at before update on public.flows
for each row execute function public.touch_updated_at();

create function public.protect_published_flow_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.published_at is not null then
    raise exception 'Published flow versions are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger flow_versions_immutable
before update or delete on public.flow_versions
for each row execute function public.protect_published_flow_version();

alter table public.flows enable row level security;
alter table public.flow_versions enable row level security;
revoke all on public.flows from anon, authenticated;
revoke all on public.flow_versions from anon, authenticated;
revoke usage, select on sequence public.flow_versions_id_seq from anon, authenticated;

comment on table public.flows is 'Flow metadata only. CSV content must never be stored here.';
comment on table public.flow_versions is 'Immutable after publication; updates create a new version.';

-- A published vertical-slice demo. Its random edit hash intentionally has no recoverable token.
insert into public.flows (id, public_id, edit_token_hash, name, description, status, current_published_version)
values (
  '00000000-0000-4000-8000-000000000001',
  'invoice-payment-check',
  encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'),
  '請求・入金チェック',
  '請求番号で請求CSVと入金CSVを照合し、一致・金額不一致・未入金・請求なし入金に分類します。',
  'published',
  null
);

insert into public.flow_versions (
  flow_id, version_number, input_definition, sql, output_definition, duckdb_version, published_at
) values (
  '00000000-0000-4000-8000-000000000001',
  1,
  '[
    {"id":"invoices","label":"請求CSV","tableName":"invoices","encoding":"auto","delimiter":",","requiredColumns":[{"name":"請求番号","type":"VARCHAR","required":true},{"name":"請求金額","type":"DOUBLE","required":true}]},
    {"id":"payments","label":"入金CSV","tableName":"payments","encoding":"auto","delimiter":",","requiredColumns":[{"name":"請求番号","type":"VARCHAR","required":true},{"name":"入金額","type":"DOUBLE","required":true}]}
  ]'::jsonb,
  $flow$WITH invoice_totals AS (
  SELECT CAST("請求番号" AS VARCHAR) AS invoice_no, SUM(TRY_CAST("請求金額" AS DOUBLE)) AS billed
  FROM invoices GROUP BY 1
), payment_totals AS (
  SELECT CAST("請求番号" AS VARCHAR) AS invoice_no, SUM(TRY_CAST("入金額" AS DOUBLE)) AS paid
  FROM payments GROUP BY 1
)
SELECT COALESCE(i.invoice_no, p.invoice_no) AS "請求番号", i.billed AS "請求金額", p.paid AS "入金額",
CASE WHEN i.invoice_no IS NULL THEN '請求なし入金' WHEN p.invoice_no IS NULL THEN '未入金'
WHEN i.billed = p.paid THEN '一致' ELSE '金額不一致' END AS "判定"
FROM invoice_totals i FULL OUTER JOIN payment_totals p USING (invoice_no)
ORDER BY "判定", "請求番号"$flow$,
  '{"fileName":"請求入金チェック結果.csv","encoding":"utf-8-bom"}'::jsonb,
  '1.32.0',
  now()
);

update public.flows set current_published_version = 1
where id = '00000000-0000-4000-8000-000000000001';
