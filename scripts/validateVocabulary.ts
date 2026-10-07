/**
 * Check the unique-word estimator against books whose full vocabulary is known.
 *
 *   mkdir -p /tmp/gutenberg && for id in 1342 2701 1400 345 84 1661 98 2600 11 74; do
 *     curl -sL -o /tmp/gutenberg/$id.txt https://www.gutenberg.org/cache/epub/$id/pg$id.txt; done
 *   node scripts/validateVocabulary.ts /tmp/gutenberg
 *
 * Splits each novel into 375-word pages, samples n pages (consecutive runs and random draws), and compares
 * the projection to the true distinct-word count. Reports bias, the sd of the log error (CALIBRATED_LOG_SD
 * in convex/vocabulary.ts is fitted to this, ≈ 0.72/√n), and how often the reported 95% range covers the truth.
 */
import { readdirSync, readFileSync } from "node:fs";
import { computeVocabularyStats, vocabularyTokens } from "../convex/vocabulary.ts";

const WORDS_PER_PAGE = 375;
const dir = process.argv[2];

function pages(file: string): string[] {
  let text = readFileSync(`${dir}/${file}`, "utf8");
  const start = text.search(/\*\*\* ?START OF/i);
  text = text.slice(text.indexOf("\n", start) + 1, text.search(/\*\*\* ?END OF/i));
  const words = text.split(/\s+/).filter(Boolean);
  const result: string[] = [];
  for (let i = 0; i + WORDS_PER_PAGE <= words.length; i += WORDS_PER_PAGE) {
    result.push(words.slice(i, i + WORDS_PER_PAGE).join(" "));
  }
  return result;
}

function seededRandom(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

const results = new Map<number, { logError: number; covered: boolean }[]>();
for (const file of readdirSync(dir).filter((f) => f.endsWith(".txt"))) {
  const book = pages(file);
  const truth = new Set(book.flatMap(vocabularyTokens)).size;
  console.log(`${file}: ${book.length} pages, ${truth.toLocaleString()} unique words`);
  for (const n of [4, 6, 10, 15, 20, 30, 50]) {
    if (n > book.length / 2) continue;
    for (let trial = 0; trial < 16; trial++) {
      let sample: string[];
      if (trial % 2 === 0) {
        const start = Math.floor((trial / 16) * (book.length - n));
        sample = book.slice(start, start + n);
      } else {
        const random = seededRandom(trial + 7);
        sample = [...book.keys()].sort(() => random() - 0.5).slice(0, n).map((i) => book[i]);
      }
      const { uniqueWords, low, high } = computeVocabularyStats(sample, book.length)!.projection!;
      const runs = results.get(n) ?? [];
      runs.push({ logError: Math.log(uniqueWords / truth), covered: low <= truth && truth <= high });
      results.set(n, runs);
    }
  }
}

console.log("\n  n   bias    sd(log error)   95% range coverage");
for (const [n, runs] of results) {
  const mean = runs.reduce((s, r) => s + r.logError, 0) / runs.length;
  const sd = Math.sqrt(runs.reduce((s, r) => s + (r.logError - mean) ** 2, 0) / runs.length);
  const coverage = runs.filter((r) => r.covered).length / runs.length;
  console.log(
    `${String(n).padStart(3)}   ×${Math.exp(mean).toFixed(2)}   ${sd.toFixed(3).padStart(8)}        ${(100 * coverage).toFixed(0)}%`
  );
}
