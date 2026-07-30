delete from public.flow_favorites
where process_key = 'invoice-payment-check';

delete from public.flow_usage_daily
where process_key = 'invoice-payment-check';

delete from public.flows
where public_id = 'invoice-payment-check';
