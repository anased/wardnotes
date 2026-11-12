-- Local stand-in for the parts of Supabase the topic migration needs
-- (auth.users, auth.uid(), anon/authenticated roles, a minimal notes table).
-- Used only by scripts/db-tests/run-topics-tests.sh; never run against Supabase.
DROP DATABASE IF EXISTS wn_test;
CREATE DATABASE wn_test;
\c wn_test
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
CREATE SCHEMA extensions;
CREATE EXTENSION "uuid-ossp" SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated;
CREATE TABLE public.notes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL, content jsonb NOT NULL, tags text[] DEFAULT '{}', category text NOT NULL,
    status text NOT NULL DEFAULT 'answered', content_type text,
    created_at timestamptz DEFAULT now() NOT NULL);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sel" ON public.notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ins" ON public.notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "upd" ON public.notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "del" ON public.notes FOR DELETE USING (auth.uid() = user_id);
GRANT ALL ON public.notes TO authenticated;
CREATE TABLE public.tags (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid NOT NULL, name text NOT NULL, created_at timestamptz DEFAULT now(), UNIQUE(user_id,name));
INSERT INTO auth.users VALUES ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');
