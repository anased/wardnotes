#!/usr/bin/env node
/**
 * Groups likely duplicate tags and categories from the taxonomy inventory.
 * Read-only: it never connects to the database.
 *
 * Usage:
 *   1. Run scripts/audit-taxonomy.sql in the Supabase SQL editor (or via the
 *      Supabase MCP) and save the result rows as JSON (array of
 *      { user_id, kind, name, note_count, in_table }).
 *   2. node scripts/audit-taxonomy.mjs inventory.json [--user <uuid>]
 *
 * Prints, per user and kind, a markdown table of every name with its usage,
 * followed by suspected duplicate groups and the reason each was flagged.
 */
import { readFileSync } from 'node:fs';

export function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const norm = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const singular = (s) => s.replace(/(ies)$/, 'y').replace(/(?<=[^s])s$/, '');
const LEFTOVER_SUFFIX = /\s+(new|old|copy|test|\d+)$/i;

/** Returns the reason two names look like duplicates, or null. */
export function duplicateReason(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return 'same ignoring case/spacing';
  if (singular(x) === singular(y)) return 'singular/plural';
  if (x.replace(LEFTOVER_SUFFIX, '') === y || y.replace(LEFTOVER_SUFFIX, '') === x) return 'leftover suffix';
  const sx = x.replace(/[^a-z0-9]/g, '');
  const sy = y.replace(/[^a-z0-9]/g, '');
  if (sx === sy) return 'punctuation only';
  // Typos: one edit, and only for words long enough that one edit is meaningful
  // (distance 2 flags real pairs such as neuro-oncology / neuro-otology).
  if (Math.min(sx.length, sy.length) >= 5 && levenshtein(sx, sy) === 1) return 'likely typo (1 edit)';
  return null;
}

/** Union-find grouping of rows whose names look like duplicates. */
export function findDuplicateGroups(rows) {
  const parent = rows.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const reasons = new Map();
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const reason = duplicateReason(rows[i].name, rows[j].name);
      if (reason) {
        parent[find(j)] = find(i);
        reasons.set(`${i}:${j}`, reason);
      }
    }
  }
  const groups = new Map();
  rows.forEach((_, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  });
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      members: g.map((i) => rows[i]).sort((p, q) => q.note_count - p.note_count),
      reasons: [...new Set([...reasons].filter(([k]) => g.includes(+k.split(':')[0])).map(([, r]) => r))],
    }));
}

/** Names that are not topics: casing outliers and content-type/status words. */
export function styleFlags(name) {
  const flags = [];
  if (/^[a-z]/.test(name) && !/^[a-z]+[A-Z]/.test(name)) flags.push('lowercase');
  if (/^(question\/answer|article|trials?|review|case)$/i.test(name)) flags.push('content type');
  if (/^not answered$/i.test(name)) flags.push('status');
  return flags;
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const userIdx = args.indexOf('--user');
  const onlyUser = userIdx >= 0 ? args[userIdx + 1] : null;
  if (!file) {
    console.error('Usage: node scripts/audit-taxonomy.mjs inventory.json [--user <uuid>]');
    process.exit(1);
  }
  const rows = JSON.parse(readFileSync(file, 'utf8')).filter((r) => !onlyUser || r.user_id === onlyUser);
  const byKey = new Map();
  for (const r of rows) {
    const key = `${r.user_id}\t${r.kind}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ ...r, note_count: Number(r.note_count) });
  }
  for (const [key, list] of byKey) {
    const [user, kind] = key.split('\t');
    list.sort((a, b) => b.note_count - a.note_count || a.name.localeCompare(b.name));
    console.log(`\n## ${kind === 'tag' ? 'Tags' : 'Categories'} for user ${user} (${list.length})\n`);
    console.log('| Name | Notes | In table | Flags |\n|---|---:|:---:|---|');
    for (const r of list) {
      console.log(`| ${r.name} | ${r.note_count} | ${r.in_table ? 'yes' : 'no'} | ${[...styleFlags(r.name), r.note_count === 0 ? 'unused' : ''].filter(Boolean).join(', ')} |`);
    }
    const groups = findDuplicateGroups(list);
    if (groups.length) {
      console.log('\n**Suspected duplicates**\n');
      for (const g of groups) {
        console.log(`- ${g.members.map((m) => `"${m.name}" (${m.note_count})`).join(' / ')} — ${g.reasons.join('; ')}`);
      }
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
