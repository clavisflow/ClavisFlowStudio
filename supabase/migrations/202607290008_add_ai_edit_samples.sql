alter table public.flow_versions
  add column ai_sample_definition jsonb
  check (
    ai_sample_definition is null
    or (
      jsonb_typeof(ai_sample_definition) = 'object'
      and pg_column_size(ai_sample_definition) <= 262144
    )
  );

comment on column public.flow_versions.ai_sample_definition is
  'Private AI-generated editing samples. They are versioned with the flow and are never returned by the public-flow API.';
