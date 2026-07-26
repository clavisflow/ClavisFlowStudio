alter table public.flow_versions
  add column instruction text not null default ''
  check (char_length(instruction) <= 4000);

insert into public.flow_versions (
  flow_id, version_number, instruction, input_definition, sql,
  output_definition, duckdb_version, published_at
)
select
  flow_id,
  2,
  '請求データと入金データを請求番号で突き合わせて、入金済み、金額違い、未入金、請求のない入金が分かるようにして。',
  input_definition,
  sql,
  output_definition,
  duckdb_version,
  now()
from public.flow_versions
where flow_id = '00000000-0000-4000-8000-000000000001'
  and version_number = 1;

update public.flows
set current_published_version = 2
where id = '00000000-0000-4000-8000-000000000001';
