alter table public.flows
  add column categories text[] not null default '{}'
  check (
    cardinality(categories) between 0 and 6
    and categories <@ array['整形', '集計', '結合', '変換', 'チェック', '抽出']::text[]
  );

create index flows_categories_gin_idx on public.flows using gin(categories);

update public.flows
set categories = array['チェック']
where public_id = 'invoice-payment-check';
