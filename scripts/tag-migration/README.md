# Tags → topics migration

Moves the free-text tags on notes into the topic system (topics, sections,
note↔topic links) and files every note under a topic. Nothing changes until
you approve a mapping and run the generated SQL with `--commit`.
**`notes.tags` and the `tags` table are never modified**: tags that aren't
subjects (RITE, Pediatric…) stay on notes as *labels* (the app shows tags as
"Labels"). Removing migrated tags is a separate, later step (see the end).

## 1. Inventory (read-only)

Run `inventory.sql` in the Supabase SQL editor. It returns one JSON cell; save
it as `scripts/tag-migration/out/inventory.json`. (`out/` is git-ignored: it
holds account data.)

## 2. Draft a mapping

```bash
npm run tags:export -- scripts/tag-migration/out/inventory.json
```

This writes `out/tag-mapping.csv` and `out/tag-mapping.json`, with a suggested
action for every tag:

| action    | meaning |
|-----------|---------|
| `topic`   | Notes with this tag are filed under `topic`. Several tags can share a topic (synonyms); a tag that differs from its topic's name is added as an alias. Optional `parents` (e.g. `Neurology > Cerebrovascular \| Neurology > Neurocritical care`), extra `aliases` (`A \| B`) and a `section` to file these notes under. If no topic has that name yet but one is named after an alias, it is renamed instead (a merge: same record and links, the old name becomes an alias). |
| `section` | The tag names a part of a topic (Pathophysiology, Pearls…). Notes are filed under that section in each of their topics. |
| `keep`    | A cross-cutting label (exam source, population, setting): it stays on notes as a label. No topic or section is made; the report lists it. |
| `drop`    | Ignore the tag (it stays on notes for now). |

Rows with `review = yes` need a decision. Tags used on a large share of an
account's notes or across several specialties (e.g. RITE, Pediatric) are
suggested as `keep`, with the reason; tags on test accounts are flagged too.
Kinds of note (article, question, case) are the note's Type, not sections. `reason`, `note_count`,
`categories` and `sample_titles` are there to help; they are ignored on apply.
Keep `user_id` as exported. A topic named after a category (e.g. Neurology) is
that specialty's top-level topic.

## 3. Check and dry-run

```bash
npm run tags:check -- scripts/tag-migration/out/tag-mapping.csv
npm run --silent tags:apply -- scripts/tag-migration/out/tag-mapping.csv > scripts/tag-migration/out/apply.sql
```

Run `apply.sql` in the SQL editor. It ends with `ROLLBACK`, so nothing is
saved; the last result is a report: topics/sections/links that would be
added, aliases, parent links skipped because they would create a cycle,
notes filed under their category, labels kept (with note counts), notes per
topic, and notes that would still have no topic.

Adjust the mapping and repeat until the report looks right.

## 4. Apply

```bash
npm run --silent tags:apply -- scripts/tag-migration/out/tag-mapping.csv --commit > scripts/tag-migration/out/apply.sql
```

Run it once more. The first committed run snapshots the topic tables into
`backup.*_pre_tagmap`.

- **Safe to re-run.** Existing topics are reused (matched by name or alias),
  existing links are never changed (edits made in the app survive), and a
  primary topic is only set for notes without one: the most specific of the
  note's new topics (deepest in the tree, then fewest notes, then tag order).
- **Every note gets a topic.** After the mapping, any note (every user,
  tagged or not) that still has no topic link is filed under the topic named
  after its `category` (the specialty, e.g. Neurology; created if missing,
  reused by name or alias) and made primary, keeping its section tag if it
  has one. Notes whose category is empty are left unfiled and listed. Pass
  `--no-category-fallback` to skip this.

## Later: removing migrated tags (not implemented)

Once the migration is applied and checked in the app, the tags that became
topics or sections are redundant. A separate, explicitly confirmed step will
remove them: for each `topic`/`section` (and `drop`) row, remove that tag from
`notes.tags` of the notes it was applied to and delete it from the `tags`
table, after a backup of both. `keep` rows are left alone: they are the labels.
None of this exists yet; the scripts here never touch tags.

## Undo

`rollback.sql` removes topics, sections, parent links and note links added
since the snapshot (dry run by default; change `ROLLBACK` to `COMMIT`). It
can't tell migration rows from ones you added in the app afterwards, so it
removes both.

## Tests

```bash
npm run test:scripts                         # unit tests (no database)
bash scripts/db-tests/run-tag-migration-tests.sh   # local Postgres: dry run, commit, re-run, rollback
```
