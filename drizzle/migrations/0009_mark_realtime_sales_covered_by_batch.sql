ALTER TABLE public.datacrazy_sales_sync_queue
DROP CONSTRAINT datacrazy_sales_sync_queue_status_check;

ALTER TABLE public.datacrazy_sales_sync_queue
ADD CONSTRAINT datacrazy_sales_sync_queue_status_check
CHECK (status IN ('pending', 'sent', 'coberto_pelo_lote'));