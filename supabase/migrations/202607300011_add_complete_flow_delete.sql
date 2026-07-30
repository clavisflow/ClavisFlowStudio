create or replace function public.delete_flow_completely(p_flow_id uuid, p_process_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_rows integer;
begin
  delete from public.flow_favorites where process_key = p_process_key;
  delete from public.flow_usage_daily where process_key = p_process_key;
  delete from public.flows where id = p_flow_id and public_id = p_process_key;
  get diagnostics deleted_rows = row_count;
  return deleted_rows = 1;
end;
$$;

revoke all on function public.delete_flow_completely(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_flow_completely(uuid, text) to service_role;

comment on function public.delete_flow_completely(uuid, text) is
  'Deletes a flow and its related favorite and usage aggregates. Sample storage objects must be removed first.';
