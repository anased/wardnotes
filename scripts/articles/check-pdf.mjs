// Check how a real PDF splits into Deep Read sections (unpdf can't run under Jest).
// Usage: npx tsx scripts/articles/check-pdf.mjs path/to/article.pdf [...]
import { readFile } from 'node:fs/promises';
import { pdfToSections } from '../../src/lib/articles/pdf.ts';

for (const file of process.argv.slice(2)) {
  try {
    const sections = await pdfToSections(new Uint8Array(await readFile(file)));
    console.log(`${file}: ${sections.length} sections`);
    for (const s of sections) console.log(`  ${s.id.padEnd(6)} ${s.heading} (${s.text.length} chars): ${s.text.slice(0, 70)}…`);
  } catch (err) {
    console.log(`${file}: ${err.name}: ${err.message}`);
  }
}
