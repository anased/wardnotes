// scripts/trial-search/eval.ts
// Integration check for "search trial by name" + AI extraction, against live APIs.
//
//   npm run trials:eval                      # search + extraction (needs ANTHROPIC_API_KEY)
//   npm run trials:eval -- --search-only     # search only (free, no key needed)
//   npm run trials:eval -- --out report.md   # also write the Markdown report to a file
//
// For each trial it reports:
//   - whether the correct primary publication ranked #1 (and its rank otherwise);
//   - extracted fields from the cheap model chain (lib/ai/models: trialExtraction)
//     next to the current model (Opus 5.5, no fallback), with cost per trial.
// Uses NCBI_API_KEY / NCBI_EMAIL if set. Makes real, billed AI calls when extracting
// (about 20 calls; Opus dominates the cost).
import { writeFileSync } from 'node:fs';
import { getTaskModel, MODELS, type TaskModelConfig } from '@/lib/ai/models';
import { totalCostUsd, type AiCallRecord } from '@/lib/ai/usage';
import { extractTrialFromAbstract, type ExtractedTrial } from '@/lib/trials/extractTrial';
import { fetchPubmedArticle } from '@/lib/trials/pubmed';
import { searchTrials, type TrialSearchResult } from '@/lib/trials/searchTrials';

interface Expected {
  name: string;
  /** Accepted primary-results publications (PMID: journal year, title). */
  primary: Record<string, string>;
}

const TRIALS: Expected[] = [
  {
    name: 'SPS3',
    primary: {
      '22931315': 'N Engl J Med 2012, Effects of clopidogrel added to aspirin in patients with recent lacunar stroke',
      '23726159': 'Lancet 2013, Blood-pressure targets in patients with recent lacunar stroke: the SPS3 randomised trial',
    },
  },
  { name: 'CHANCE-2', primary: { '34708996': 'N Engl J Med 2021, Ticagrelor versus Clopidogrel in CYP2C19 Loss-of-Function Carriers with Stroke or TIA' } },
  { name: 'POINT', primary: { '29766750': 'N Engl J Med 2018, Clopidogrel and Aspirin in Acute Ischemic Stroke and High-Risk TIA' } },
  { name: 'INSPIRES', primary: { '38157499': 'N Engl J Med 2023, Dual Antiplatelet Treatment up to 72 Hours after Ischemic Stroke' } },
  { name: 'THALES', primary: { '32668111': 'N Engl J Med 2020, Ticagrelor and Aspirin or Aspirin Alone in Acute Ischemic Stroke or TIA' } },
  { name: 'NAVIGATE ESUS', primary: { '29766772': 'N Engl J Med 2018, Rivaroxaban for Stroke Prevention after Embolic Stroke of Undetermined Source' } },
  { name: 'ELAN', primary: { '37222476': 'N Engl J Med 2023, Early versus Later Anticoagulation for Stroke with Atrial Fibrillation' } },
  { name: 'CSPS.com', primary: { '31122494': 'Lancet Neurol 2019, Dual antiplatelet therapy using cilostazol … randomised controlled trial' } },
  { name: 'ARCADIA', primary: { '38324415': 'JAMA 2024, Apixaban to Prevent Recurrence After Cryptogenic Stroke … The ARCADIA Randomized Clinical Trial' } },
  {
    name: 'SAMMPRIS',
    primary: {
      '21899409': 'N Engl J Med 2011, Stenting versus aggressive medical therapy for intracranial arterial stenosis',
      '24168957': 'Lancet 2014, Aggressive medical treatment with or without stenting … (final results)',
    },
  },
];

const FIELDS: (keyof ExtractedTrial)[] = [
  'is_clinical_trial',
  'acronym',
  'full_name',
  'year',
  'population',
  'intervention',
  'comparator',
  'result',
  'notes',
];

/** The pre-change setup: Opus 5.5 for extraction, no cheap model. */
const CURRENT: TaskModelConfig = { provider: 'anthropic', model: MODELS.opus, effort: 'low' };

interface ExtractionRun {
  trial?: ExtractedTrial;
  servedBy?: string;
  calls: AiCallRecord[];
  error?: string;
  ms: number;
}

async function runExtraction(source: Parameters<typeof extractTrialFromAbstract>[0], config: TaskModelConfig): Promise<ExtractionRun> {
  const calls: AiCallRecord[] = [];
  const start = Date.now();
  try {
    const { trial, servedBy } = await extractTrialFromAbstract(source, calls, config);
    return { trial, servedBy: servedBy.model, calls, ms: Date.now() - start };
  } catch (err) {
    return { calls, error: err instanceof Error ? err.message : String(err), ms: Date.now() - start };
  }
}

const usd = (n: number) => `$${n.toFixed(5)}`;
const cell = (v: unknown) => (v === null || v === undefined ? '—' : String(v)).replace(/\|/g, '\\|').replace(/\n/g, ' ');

async function main() {
  const args = process.argv.slice(2);
  const searchOnly = args.includes('--search-only');
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const extract = !searchOnly && !!process.env.ANTHROPIC_API_KEY;

  const cheap = getTaskModel('trialExtraction');
  const lines: string[] = [];
  const log = (s = '') => {
    lines.push(s);
    console.log(s);
  };

  log(`# Trial search + extraction report`);
  log();
  log(`Run: ${new Date().toISOString()} · NCBI API key: ${process.env.NCBI_API_KEY ? 'yes' : 'no'}`);
  log(
    `Extraction: ${
      extract
        ? `cheap chain = ${cheap.model}${cheap.fallback ? ` → fallback ${cheap.fallback.model}` : ''}; current = ${CURRENT.model}`
        : searchOnly
          ? 'skipped (--search-only)'
          : 'skipped (ANTHROPIC_API_KEY not set)'
    }`
  );
  log();

  // ---------------- search ----------------
  const searches: { t: Expected; result?: TrialSearchResult; error?: string; ms: number }[] = [];
  for (const t of TRIALS) {
    const start = Date.now();
    try {
      searches.push({ t, result: await searchTrials({ kind: 'name', value: t.name }), ms: Date.now() - start });
    } catch (err) {
      searches.push({ t, error: err instanceof Error ? err.message : String(err), ms: Date.now() - start });
    }
  }

  log(`## Name search (PubMed + ClinicalTrials.gov, no LLM, $0)`);
  log();
  log(`| Trial | Correct #1? | Rank of primary | #1 result | Ambiguity notice | Time |`);
  log(`|---|---|---|---|---|---|`);
  let correct = 0;
  for (const { t, result, error, ms } of searches) {
    if (!result) {
      log(`| ${t.name} | error | — | ${cell(error)} | — | ${ms} ms |`);
      continue;
    }
    const ranks = result.candidates.map((c, i) => (t.primary[c.pmid] ? i + 1 : 0)).filter(Boolean);
    const rank = ranks.length ? Math.min(...ranks) : null;
    if (rank === 1) correct++;
    const top = result.candidates[0];
    const topLabel = top ? `${top.pmid} · ${top.journalAbbrev} ${top.year} · ${top.title.slice(0, 70)}` : '(none)';
    log(
      `| ${t.name} | ${rank === 1 ? '✅' : '❌'} | ${rank ?? 'not in top 5'} | ${cell(topLabel)} | ${cell(result.ambiguous ? result.notice : '')} | ${ms} ms |`
    );
  }
  log();
  log(`**Primary publication ranked #1: ${correct}/${TRIALS.length}.**`);
  log();

  // ---------------- extraction ----------------
  if (extract) {
    log(`## Extraction: cheap chain vs current model`);
    log();
    const summary: string[] = [];
    let cheapTotal = 0;
    let currentTotal = 0;
    for (const { t, result } of searches) {
      const pmid = result?.candidates[0]?.pmid ?? Object.keys(t.primary)[0];
      let article;
      try {
        article = await fetchPubmedArticle(pmid);
      } catch (err) {
        log(`### ${t.name}: could not fetch PMID ${pmid}: ${err instanceof Error ? err.message : err}`);
        continue;
      }
      const source = { title: article.title, journal: article.journal, year: article.year, abstract: article.abstract };
      const [a, b] = await Promise.all([runExtraction(source, cheap), runExtraction(source, CURRENT)]);
      const costA = totalCostUsd(a.calls);
      const costB = totalCostUsd(b.calls);
      cheapTotal += costA;
      currentTotal += costB;

      log(`### ${t.name} (PMID ${pmid})`);
      log();
      log(`| Field | Cheap chain (${a.servedBy ?? 'failed'}) | Current (${b.servedBy ?? 'failed'}) |`);
      log(`|---|---|---|`);
      if (a.error || b.error) log(`| error | ${cell(a.error)} | ${cell(b.error)} |`);
      for (const f of FIELDS) log(`| ${f} | ${cell(a.trial?.[f])} | ${cell(b.trial?.[f])} |`);
      const fmtCalls = (r: ExtractionRun) =>
        r.calls.map((c) => `${c.model}${c.success ? '' : ' ✗'} (${c.totalInputTokens}+${c.outputTokens} tok)`).join(', ');
      log(`| calls | ${cell(fmtCalls(a))} | ${cell(fmtCalls(b))} |`);
      log(`| cost | ${usd(costA)} | ${usd(costB)} |`);
      log(`| time | ${a.ms} ms | ${b.ms} ms |`);
      log();
      summary.push(`| ${t.name} | ${usd(costA)} | ${usd(costB)} | ${a.calls.length > 1 ? `${a.calls.length} calls, served by ${a.servedBy ?? '—'}` : ''} |`);
    }
    log(`## Cost per trial`);
    log();
    log(`| Trial | Cheap chain | Current | Notes |`);
    log(`|---|---|---|---|`);
    for (const s of summary) log(s);
    log(`| **Total** | **${usd(cheapTotal)}** | **${usd(currentTotal)}** | ${currentTotal > 0 ? `${(currentTotal / Math.max(cheapTotal, 1e-9)).toFixed(0)}× cheaper` : ''} |`);
    log();
  }

  if (outPath) {
    writeFileSync(outPath, lines.join('\n') + '\n');
    console.error(`\nWrote ${outPath}`);
  }
  if (correct < TRIALS.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
