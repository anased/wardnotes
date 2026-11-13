# Tags → topics migration

Moves the free-text tags on notes into the topic system (topics, sections,
note↔topic links). Nothing changes until you approve a mapping and run the
generated SQL with `--commit`. **`notes.tags` and the `tags` table are never
modified**; removing them is a separate step, done only after you confirm.

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
| `topic`   | Notes with this tag are filed under `topic`. Several tags can share a topic (synonyms); a tag that differs from its topic's name is added as an alias. Optional `parents` (e.g. `Neurology > Cerebrovascular \| Neurology > Neurocritical care`), extra `aliases` (`A \| B`) and a `section` to file these notes under. |
| `section` | The tag names a part of a topic (Pathophysiology, Pearls…). Notes are filed under that section in each of their topics. |
| `drop`    | Ignore the tag (it stays on notes for now). |

Rows with `review = yes` need a decision (e.g. cross-cutting labels like an
exam name or "Pediatric", or tags on test accounts). `reason`, `note_count`,
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
notes per topic, and tagged notes that would not be filed.

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
- A note with only section tags is filed under its category's topic; pass
  `--no-category-fallback` to leave such notes unfiled instead.

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
