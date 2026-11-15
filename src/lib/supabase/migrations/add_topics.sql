--
-- Topic-based knowledge organization (2026-11-12)
--
-- Adds topics as first-class records alongside the existing category/tags:
--   topics          a topic per user (name, aliases, description)
--   topic_edges     parent -> child; a topic can have several parents; no cycles
--   topic_sections  optional, per-topic sections (Overview, Diagnosis, ...)
--   note_topics     note <-> topic, optional section, exactly one primary per note
--   trials          shared trial records
--   trial_topics    trial <-> topic, optional section
--   note_links      labeled links between notes and trials
--
-- * Additive only: no existing table or column is changed or removed, apart
--   from a UNIQUE (id, user_id) constraint on notes (used by foreign keys so
--   a link can never join two users' rows).
-- * Every table carries user_id and has the same "own rows only" RLS policies
--   as the rest of the schema.
-- * Safe to run more than once (IF NOT EXISTS / CREATE OR REPLACE / policies
--   dropped and recreated). Undo with add_topics_rollback.sql.
-- * Requires Postgres 15+ (ON DELETE SET NULL (column), NULLS NOT DISTINCT).
--

BEGIN;

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

-- Trim and collapse internal whitespace (also defined by
-- improve_tag_management.sql; repeated so this file stands alone).
CREATE OR REPLACE FUNCTION public.normalize_tag_name(p_name text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Lets note_topics / note_links reference (note id, owner) pairs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_id_user_id_key') THEN
    ALTER TABLE public.notes ADD CONSTRAINT notes_id_user_id_key UNIQUE (id, user_id);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  aliases     text[] NOT NULL DEFAULT '{}',
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT topics_name_check CHECK (btrim(name) <> '' AND char_length(name) <= 120),
  CONSTRAINT topics_id_user_id_key UNIQUE (id, user_id)
);

-- One topic per name per user, ignoring case.
CREATE UNIQUE INDEX IF NOT EXISTS topics_user_lower_name_key ON public.topics (user_id, lower(name));
CREATE INDEX IF NOT EXISTS topics_user_id_idx ON public.topics (user_id);

CREATE TABLE IF NOT EXISTS public.topic_edges (
  parent_id  uuid NOT NULL,
  child_id   uuid NOT NULL,
  user_id    uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, child_id),
  CONSTRAINT topic_edges_not_self CHECK (parent_id <> child_id),
  CONSTRAINT topic_edges_parent_fkey FOREIGN KEY (parent_id, user_id)
    REFERENCES public.topics (id, user_id) ON DELETE CASCADE,
  CONSTRAINT topic_edges_child_fkey FOREIGN KEY (child_id, user_id)
    REFERENCES public.topics (id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS topic_edges_child_id_idx ON public.topic_edges (child_id);
CREATE INDEX IF NOT EXISTS topic_edges_user_id_idx ON public.topic_edges (user_id);

CREATE TABLE IF NOT EXISTS public.topic_sections (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id   uuid NOT NULL,
  user_id    uuid NOT NULL DEFAULT auth.uid(),
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT topic_sections_name_check CHECK (btrim(name) <> '' AND char_length(name) <= 80),
  CONSTRAINT topic_sections_id_topic_id_key UNIQUE (id, topic_id),
  CONSTRAINT topic_sections_topic_fkey FOREIGN KEY (topic_id, user_id)
    REFERENCES public.topics (id, user_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS topic_sections_topic_lower_name_key
  ON public.topic_sections (topic_id, lower(name));
CREATE INDEX IF NOT EXISTS topic_sections_topic_order_idx ON public.topic_sections (topic_id, sort_order);
CREATE INDEX IF NOT EXISTS topic_sections_user_id_idx ON public.topic_sections (user_id);

CREATE TABLE IF NOT EXISTS public.note_topics (
  note_id    uuid NOT NULL,
  topic_id   uuid NOT NULL,
  user_id    uuid NOT NULL DEFAULT auth.uid(),
  section_id uuid,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, topic_id),
  CONSTRAINT note_topics_note_fkey FOREIGN KEY (note_id, user_id)
    REFERENCES public.notes (id, user_id) ON DELETE CASCADE,
  CONSTRAINT note_topics_topic_fkey FOREIGN KEY (topic_id, user_id)
    REFERENCES public.topics (id, user_id) ON DELETE CASCADE,
  -- The section must belong to the same topic. Deleting a section moves its
  -- notes to "Unsorted" (section_id = NULL) and keeps the topic link.
  CONSTRAINT note_topics_section_fkey FOREIGN KEY (section_id, topic_id)
    REFERENCES public.topic_sections (id, topic_id) ON DELETE SET NULL (section_id)
);

-- At most one primary topic per note (set_note_topics and the trigger below
-- make it exactly one whenever the note has any topic).
CREATE UNIQUE INDEX IF NOT EXISTS note_topics_one_primary_key
  ON public.note_topics (note_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS note_topics_topic_section_idx ON public.note_topics (topic_id, section_id);
CREATE INDEX IF NOT EXISTS note_topics_user_id_idx ON public.note_topics (user_id);

CREATE TABLE IF NOT EXISTS public.trials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  acronym       text NOT NULL,
  full_name     text,
  year          integer,
  population    text,
  intervention  text,
  comparator    text,
  result        text,
  notes         text,
  superseded_by uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trials_acronym_check CHECK (btrim(acronym) <> '' AND char_length(acronym) <= 60),
  CONSTRAINT trials_year_check CHECK (year IS NULL OR year BETWEEN 1900 AND 2100),
  CONSTRAINT trials_not_superseded_by_self CHECK (superseded_by IS NULL OR superseded_by <> id),
  CONSTRAINT trials_id_user_id_key UNIQUE (id, user_id),
  CONSTRAINT trials_superseded_by_fkey FOREIGN KEY (superseded_by, user_id)
    REFERENCES public.trials (id, user_id) ON DELETE SET NULL (superseded_by)
);

-- One record per trial: same acronym and year (or both without a year) is a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS trials_user_acronym_year_key
  ON public.trials (user_id, lower(acronym), year) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS trials_user_id_idx ON public.trials (user_id);

CREATE TABLE IF NOT EXISTS public.trial_topics (
  trial_id   uuid NOT NULL,
  topic_id   uuid NOT NULL,
  user_id    uuid NOT NULL DEFAULT auth.uid(),
  section_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trial_id, topic_id),
  CONSTRAINT trial_topics_trial_fkey FOREIGN KEY (trial_id, user_id)
    REFERENCES public.trials (id, user_id) ON DELETE CASCADE,
  CONSTRAINT trial_topics_topic_fkey FOREIGN KEY (topic_id, user_id)
    REFERENCES public.topics (id, user_id) ON DELETE CASCADE,
  CONSTRAINT trial_topics_section_fkey FOREIGN KEY (section_id, topic_id)
    REFERENCES public.topic_sections (id, topic_id) ON DELETE SET NULL (section_id)
);

CREATE INDEX IF NOT EXISTS trial_topics_topic_section_idx ON public.trial_topics (topic_id, section_id);
CREATE INDEX IF NOT EXISTS trial_topics_user_id_idx ON public.trial_topics (user_id);

-- Links point at either a note or a trial, so they can't use plain foreign
-- keys; triggers below check the endpoints and clean up on delete.
CREATE TABLE IF NOT EXISTS public.note_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id   uuid NOT NULL,
  target_type text NOT NULL,
  target_id   uuid NOT NULL,
  relation    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT note_links_source_type_check CHECK (source_type IN ('note', 'trial')),
  CONSTRAINT note_links_target_type_check CHECK (target_type IN ('note', 'trial')),
  CONSTRAINT note_links_relation_check
    CHECK (relation IN ('answers', 'supports', 'cites', 'critiques', 'illustrates', 'related')),
  CONSTRAINT note_links_not_self CHECK (NOT (source_type = target_type AND source_id = target_id)),
  CONSTRAINT note_links_unique UNIQUE (source_type, source_id, target_type, target_id, relation)
);

CREATE INDEX IF NOT EXISTS note_links_source_idx ON public.note_links (source_type, source_id);
CREATE INDEX IF NOT EXISTS note_links_target_idx ON public.note_links (target_type, target_id);
CREATE INDEX IF NOT EXISTS note_links_user_id_idx ON public.note_links (user_id);

-- ----------------------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------------------

-- Topics: tidy the name and aliases (trim, collapse spaces, drop empty,
-- case-insensitive duplicates and aliases equal to the name).
CREATE OR REPLACE FUNCTION public.topics_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.name := public.normalize_tag_name(NEW.name);
  NEW.description := NULLIF(btrim(COALESCE(NEW.description, '')), '');
  NEW.aliases := COALESCE((
    SELECT array_agg(a ORDER BY ord)
    FROM (
      SELECT DISTINCT ON (lower(a)) a, ord
      FROM unnest(COALESCE(NEW.aliases, '{}')) WITH ORDINALITY AS u(raw, ord),
           LATERAL (SELECT public.normalize_tag_name(raw) AS a) n
      WHERE a <> '' AND lower(a) <> lower(NEW.name)
      ORDER BY lower(a), ord
    ) s
  ), '{}');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS topics_normalize ON public.topics;
CREATE TRIGGER topics_normalize BEFORE INSERT OR UPDATE ON public.topics
  FOR EACH ROW EXECUTE FUNCTION public.topics_normalize();

DROP TRIGGER IF EXISTS topics_set_updated_at ON public.topics;
CREATE TRIGGER topics_set_updated_at BEFORE UPDATE ON public.topics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trials_set_updated_at ON public.trials;
CREATE TRIGGER trials_set_updated_at BEFORE UPDATE ON public.trials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.topic_sections_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.name := public.normalize_tag_name(NEW.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS topic_sections_normalize ON public.topic_sections;
CREATE TRIGGER topic_sections_normalize BEFORE INSERT OR UPDATE ON public.topic_sections
  FOR EACH ROW EXECUTE FUNCTION public.topic_sections_normalize();

-- Topic edges: refuse an edge that would make a topic its own ancestor.
CREATE OR REPLACE FUNCTION public.topic_edges_prevent_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Serialize edge changes per user so two concurrent inserts can't
  -- together form a cycle.
  PERFORM pg_advisory_xact_lock(hashtext('topic_edges:' || NEW.user_id::text));

  IF EXISTS (
    WITH RECURSIVE below(id) AS (
      SELECT NEW.child_id
      UNION
      SELECT e.child_id FROM public.topic_edges e JOIN below b ON e.parent_id = b.id
    )
    SELECT 1 FROM below WHERE id = NEW.parent_id
  ) THEN
    RAISE EXCEPTION 'A topic cannot be placed under itself or one of its subtopics'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS topic_edges_prevent_cycle ON public.topic_edges;
CREATE TRIGGER topic_edges_prevent_cycle BEFORE INSERT OR UPDATE ON public.topic_edges
  FOR EACH ROW EXECUTE FUNCTION public.topic_edges_prevent_cycle();

-- Note topics: when the primary link goes away (topic deleted, link removed),
-- promote the oldest remaining link so the note keeps exactly one primary.
CREATE OR REPLACE FUNCTION public.note_topics_keep_primary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_primary AND NOT EXISTS (
    SELECT 1 FROM public.note_topics WHERE note_id = OLD.note_id AND is_primary
  ) THEN
    UPDATE public.note_topics
    SET is_primary = true
    WHERE (note_id, topic_id) = (
      SELECT note_id, topic_id FROM public.note_topics
      WHERE note_id = OLD.note_id
      ORDER BY created_at, topic_id
      LIMIT 1
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS note_topics_keep_primary ON public.note_topics;
CREATE TRIGGER note_topics_keep_primary AFTER DELETE ON public.note_topics
  FOR EACH ROW EXECUTE FUNCTION public.note_topics_keep_primary();

-- Note links: both ends must exist and belong to the link's owner.
CREATE OR REPLACE FUNCTION public.note_links_check_endpoints()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT (
    CASE NEW.source_type
      WHEN 'note'  THEN EXISTS (SELECT 1 FROM public.notes  WHERE id = NEW.source_id AND user_id = NEW.user_id)
      WHEN 'trial' THEN EXISTS (SELECT 1 FROM public.trials WHERE id = NEW.source_id AND user_id = NEW.user_id)
      ELSE false
    END
  ) THEN
    RAISE EXCEPTION 'Link source % % not found', NEW.source_type, NEW.source_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT (
    CASE NEW.target_type
      WHEN 'note'  THEN EXISTS (SELECT 1 FROM public.notes  WHERE id = NEW.target_id AND user_id = NEW.user_id)
      WHEN 'trial' THEN EXISTS (SELECT 1 FROM public.trials WHERE id = NEW.target_id AND user_id = NEW.user_id)
      ELSE false
    END
  ) THEN
    RAISE EXCEPTION 'Link target % % not found', NEW.target_type, NEW.target_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS note_links_check_endpoints ON public.note_links;
CREATE TRIGGER note_links_check_endpoints BEFORE INSERT OR UPDATE ON public.note_links
  FOR EACH ROW EXECUTE FUNCTION public.note_links_check_endpoints();

-- Remove links that point at a deleted note or trial.
CREATE OR REPLACE FUNCTION public.note_links_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  kind text := TG_ARGV[0];
BEGIN
  DELETE FROM public.note_links
  WHERE (source_type = kind AND source_id = OLD.id)
     OR (target_type = kind AND target_id = OLD.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notes_cleanup_links ON public.notes;
CREATE TRIGGER notes_cleanup_links AFTER DELETE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.note_links_cleanup('note');

DROP TRIGGER IF EXISTS trials_cleanup_links ON public.trials;
CREATE TRIGGER trials_cleanup_links AFTER DELETE ON public.trials
  FOR EACH ROW EXECUTE FUNCTION public.note_links_cleanup('trial');

-- ----------------------------------------------------------------------------
-- Functions (all SECURITY INVOKER: RLS limits them to the caller's rows)
-- ----------------------------------------------------------------------------

-- A topic and every topic below it (each listed once, even when reachable
-- through several parents).
CREATE OR REPLACE FUNCTION public.topic_descendants(p_topic_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH RECURSIVE below(id) AS (
    SELECT p_topic_id
    UNION
    SELECT e.child_id FROM public.topic_edges e JOIN below b ON e.parent_id = b.id
  )
  SELECT id FROM below;
$$;

-- Notes filed under a topic, or (by default) under it or any descendant.
-- Returns notes rows, so PostgREST filters (.eq('category', ...)) still apply.
CREATE OR REPLACE FUNCTION public.notes_in_topic(p_topic_id uuid, p_include_descendants boolean DEFAULT true)
RETURNS SETOF public.notes
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT n.*
  FROM public.notes n
  WHERE n.id IN (
    SELECT nt.note_id
    FROM public.note_topics nt
    WHERE nt.topic_id IN (
      SELECT public.topic_descendants(p_topic_id) WHERE p_include_descendants
      UNION ALL
      SELECT p_topic_id WHERE NOT p_include_descendants
    )
  );
$$;

-- Topic search over names and aliases, ignoring case. Exact matches first,
-- then prefix matches, then substring matches.
CREATE OR REPLACE FUNCTION public.search_topics(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  name text,
  aliases text[],
  description text,
  matched_alias text,
  rank integer
)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT lower(public.normalize_tag_name(p_query)) AS term,
           replace(replace(replace(lower(public.normalize_tag_name(p_query)), '\', '\\'), '%', '\%'), '_', '\_') AS pat
  ),
  candidates AS (
    SELECT t.id, t.name, t.aliases, t.description, NULL::text AS matched_alias,
           CASE
             WHEN lower(t.name) = q.term THEN 0
             WHEN lower(t.name) LIKE q.pat || '%' THEN 2
             WHEN lower(t.name) LIKE '%' || q.pat || '%' THEN 4
           END AS rank
    FROM public.topics t, q
    UNION ALL
    SELECT t.id, t.name, t.aliases, t.description, a AS matched_alias,
           CASE
             WHEN lower(a) = q.term THEN 1
             WHEN lower(a) LIKE q.pat || '%' THEN 3
             WHEN lower(a) LIKE '%' || q.pat || '%' THEN 5
           END
    FROM public.topics t, q, unnest(t.aliases) AS a
  )
  SELECT * FROM (
    SELECT DISTINCT ON (c.id) c.id, c.name, c.aliases, c.description, c.matched_alias, c.rank
    FROM candidates c, q
    WHERE q.term <> '' AND c.rank IS NOT NULL
    ORDER BY c.id, c.rank
  ) best
  ORDER BY best.rank, lower(best.name)
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
$$;

-- Number of notes linked directly to each of the caller's topics.
CREATE OR REPLACE FUNCTION public.topic_note_counts()
RETURNS TABLE (topic_id uuid, note_count integer)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT nt.topic_id, count(*)::integer
  FROM public.note_topics nt
  GROUP BY nt.topic_id;
$$;

-- Replaces a note's topic links in one transaction.
-- p_links: [{"topic_id": uuid, "section_id": uuid|null, "is_primary": bool}, ...]
-- If no link (or more than one) is marked primary, the first primary one — or
-- the first link — wins, so a note with topics always has exactly one primary.
CREATE OR REPLACE FUNCTION public.set_note_topics(p_note_id uuid, p_links jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_primary uuid;
BEGIN
  SELECT user_id INTO v_user FROM public.notes WHERE id = p_note_id;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Note % not found', p_note_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- One entry per topic (first occurrence wins), in the order given.
  SELECT COALESCE(jsonb_agg(w ORDER BY (w->>'ord')::int), '[]'::jsonb)
  INTO p_links
  FROM (
    SELECT DISTINCT ON ((l->>'topic_id')::uuid)
           jsonb_build_object(
             'ord', ord,
             'topic_id', (l->>'topic_id')::uuid,
             'section_id', NULLIF(l->>'section_id', '')::uuid,
             'is_primary', COALESCE((l->>'is_primary')::boolean, false)) AS w
    FROM jsonb_array_elements(COALESCE(p_links, '[]'::jsonb)) WITH ORDINALITY AS x(l, ord)
    WHERE l ? 'topic_id'
    ORDER BY (l->>'topic_id')::uuid, ord
  ) d;

  SELECT (w->>'topic_id')::uuid INTO v_primary
  FROM jsonb_array_elements(p_links) w
  ORDER BY (w->>'is_primary')::boolean DESC, (w->>'ord')::int
  LIMIT 1;

  DELETE FROM public.note_topics nt
  WHERE nt.note_id = p_note_id
    AND nt.topic_id NOT IN (SELECT (w->>'topic_id')::uuid FROM jsonb_array_elements(p_links) w);

  -- Clear the old primary first so the one-primary index never sees two.
  UPDATE public.note_topics
  SET is_primary = false
  WHERE note_id = p_note_id AND is_primary AND topic_id IS DISTINCT FROM v_primary;

  INSERT INTO public.note_topics (note_id, topic_id, user_id, section_id, is_primary)
  SELECT p_note_id, (w->>'topic_id')::uuid, v_user, (w->>'section_id')::uuid,
         (w->>'topic_id')::uuid = v_primary
  FROM jsonb_array_elements(p_links) w
  ORDER BY (w->>'ord')::int
  ON CONFLICT (note_id, topic_id) DO UPDATE
    SET section_id = EXCLUDED.section_id,
        is_primary = EXCLUDED.is_primary;
END;
$$;

-- Replaces a trial's topic links in one transaction.
-- p_links: [{"topic_id": uuid, "section_id": uuid|null}, ...]
CREATE OR REPLACE FUNCTION public.set_trial_topics(p_trial_id uuid, p_links jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM public.trials WHERE id = p_trial_id;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Trial % not found', p_trial_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  DELETE FROM public.trial_topics tt
  WHERE tt.trial_id = p_trial_id
    AND tt.topic_id NOT IN (
      SELECT (l->>'topic_id')::uuid
      FROM jsonb_array_elements(COALESCE(p_links, '[]'::jsonb)) l
      WHERE l ? 'topic_id'
    );

  INSERT INTO public.trial_topics (trial_id, topic_id, user_id, section_id)
  SELECT DISTINCT ON ((l->>'topic_id')::uuid)
         p_trial_id, (l->>'topic_id')::uuid, v_user, NULLIF(l->>'section_id', '')::uuid
  FROM jsonb_array_elements(COALESCE(p_links, '[]'::jsonb)) l
  WHERE l ? 'topic_id'
  ON CONFLICT (trial_id, topic_id) DO UPDATE SET section_id = EXCLUDED.section_id;
END;
$$;

-- Sets section order to the order of p_section_ids (sections not listed keep
-- their place after the listed ones).
CREATE OR REPLACE FUNCTION public.reorder_topic_sections(p_topic_id uuid, p_section_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.topic_sections s
  SET sort_order = COALESCE(o.ord, 1000 + s.sort_order)
  FROM public.topic_sections s2
  LEFT JOIN unnest(p_section_ids) WITH ORDINALITY AS o(id, ord) ON o.id = s2.id
  WHERE s.id = s2.id AND s.topic_id = p_topic_id;
$$;

REVOKE EXECUTE ON FUNCTION public.topic_descendants(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.notes_in_topic(uuid, boolean) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.search_topics(text, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.topic_note_counts() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.set_note_topics(uuid, jsonb) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.set_trial_topics(uuid, jsonb) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.reorder_topic_sections(uuid, uuid[]) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.topic_descendants(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notes_in_topic(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_topics(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.topic_note_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_note_topics(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_trial_topics(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_topic_sections(uuid, uuid[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security: own rows only, as for every other table
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['topics', 'topic_edges', 'topic_sections', 'note_topics',
                           'trials', 'trial_topics', 'note_links']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

    EXECUTE format('DROP POLICY IF EXISTS "Users can view their own %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can create their own %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can update their own %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can delete their own %1$s" ON public.%1$I', t);

    EXECUTE format('CREATE POLICY "Users can view their own %1$s" ON public.%1$I
                      FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id)', t);
    EXECUTE format('CREATE POLICY "Users can create their own %1$s" ON public.%1$I
                      FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id)', t);
    EXECUTE format('CREATE POLICY "Users can update their own %1$s" ON public.%1$I
                      FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
                      WITH CHECK ((SELECT auth.uid()) = user_id)', t);
    EXECUTE format('CREATE POLICY "Users can delete their own %1$s" ON public.%1$I
                      FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id)', t);
  END LOOP;
END $$;

COMMIT;
