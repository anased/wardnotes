--
-- Undo drop_categories.sql: recreates public.categories as it was on
-- production (constraints, indexes, name trigger, RLS policies, grants) and
-- restores the rows from backup.categories_pre_drop.
-- Run this before drop_note_category_rollback.sql, whose trigger function
-- looks categories up.
--

BEGIN;

CREATE TABLE IF NOT EXISTS public.categories (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT 'blue',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT categories_user_id_name_key UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS categories_user_id_idx ON public.categories (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS categories_user_id_lower_name_key ON public.categories (user_id, lower(name));

DROP TRIGGER IF EXISTS categories_normalize_name ON public.categories;
CREATE TRIGGER categories_normalize_name
  BEFORE INSERT OR UPDATE OF name ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.normalize_name_column();

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can create their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can update their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can delete their own categories" ON public.categories;
CREATE POLICY "Users can view their own categories" ON public.categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own categories" ON public.categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own categories" ON public.categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own categories" ON public.categories FOR DELETE USING (auth.uid() = user_id);

GRANT ALL ON public.categories TO anon, authenticated, service_role;

INSERT INTO public.categories (id, user_id, name, color, created_at)
SELECT id, user_id, name, color, created_at FROM backup.categories_pre_drop
ON CONFLICT (id) DO NOTHING;

COMMIT;
