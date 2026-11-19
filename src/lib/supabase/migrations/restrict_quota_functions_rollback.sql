-- Rollback for restrict_quota_functions.sql (restores the previous, insecure grants)
GRANT EXECUTE ON FUNCTION public.check_and_increment_usage(UUID, TEXT) TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_user_quota(UUID) TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_quota(UUID) TO public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_monthly_quotas() TO public, anon, authenticated;
