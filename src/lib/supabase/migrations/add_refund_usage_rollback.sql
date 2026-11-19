-- Rollback for add_refund_usage.sql
DROP FUNCTION IF EXISTS public.refund_usage(UUID, TEXT);
