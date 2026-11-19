--
-- Restrict quota functions to the service role
--
-- These SECURITY DEFINER functions take an arbitrary user id. While anon and
-- authenticated clients could execute them, anyone holding the public anon key
-- could spend another user's quota (check_and_increment_usage) or read any
-- user's usage (get_user_quota). Only server-side code calls them, via the
-- service role (src/lib/services/quotaService.ts, /api/cron/reset-quotas).
--
-- Apply only AFTER deploying the quotaService change that uses the service role,
-- or quota checks in production will start failing.
--
-- handle_new_user_quota is a trigger function and is left untouched: triggers
-- don't check EXECUTE privilege when they fire.
--

REVOKE ALL ON FUNCTION public.check_and_increment_usage(UUID, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.initialize_user_quota(UUID) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_quota(UUID) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_monthly_quotas() FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_and_increment_usage(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.initialize_user_quota(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_quota(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_monthly_quotas() TO service_role;
