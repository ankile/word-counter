/**
 * Difficulty measures for comparing the reader's measured books: vocabulary at a common text length, so a long book
 * isn't made to look easy by repeating its words, plus whole-book totals and Flesch–Kincaid grade. convex/compare.ts
 * lists them and the main page shows them; pure, so the browser draws the same curves the server measures.
 */

import type { Doc } from "./_generated/dataModel";
import { averageReadability, computeBookEstimate } from "./stats";
import { countWords } from "./textAnalysis";
import { computeVocabularyStats, growthCurveAt, vocabularyTokens, type GrowthCurve } from "./vocabulary";

// Every book is compared at this many running words; books shorter than it aren't measured there
export const COMMON_LENGTH = 50_000;
// The window for the sample-only measure, small enough for every sample to hold
export const RANDOM_WORDS = 1_000;

// ln Γ(x) by the Lanczos approximation (g = 7), accurate to ~15 digits for x > 0
function lnGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let a = c[0];
  for (let i = 1; i < 9; i++) a += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}
const lnChoose = (n: number, k: number) => lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);

/**
 * Expected distinct word forms in m words drawn at random from the sample (Hurlbert's rarefaction): a form used f
 * times out of N is missed with probability C(N − f, m) / C(N, m). Measured on the sample alone, no extrapolation.
 */
export function distinctInRandomWords(tokens: string[], m: number): number | null {
  const N = tokens.length;
  if (N < m) return null;
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  let expected = 0;
  for (const f of counts.values()) {
    expected += N - f >= m ? 1 - Math.exp(lnChoose(N - f, m) - lnChoose(N, m)) : 1;
  }
  return expected;
}

/**
 * New distinct word forms per sampled page at page k: the slope of the fitted growth curve, V(k)·(b + 2c·ln k)/k.
 * Zero past the peak where growthCurveAt holds vocabulary flat.
 */
export function growthCurveSlope(curve: GrowthCurve, k: number): number {
  const [, b, c] = curve;
  const l = Math.log(k);
  if (c < 0 && l > -b / (2 * c)) return 0;
  return (growthCurveAt(curve, k) * (b + 2 * c * l)) / k;
}

/** New distinct word forms per 1,000 running words after `words` words, for a curve in sampled pages. */
export const newFormsPerThousand = (curve: GrowthCurve, wordsPerSampledPage: number, words: number) =>
  (growthCurveSlope(curve, words / wordsPerSampledPage) / wordsPerSampledPage) * 1000;

/** Distinct word forms after `words` running words. */
export const formsAfter = (curve: GrowthCurve, wordsPerSampledPage: number, words: number) =>
  growthCurveAt(curve, words / wordsPerSampledPage);

export interface ComparisonPage {
  origin: Doc<"pages">["origin"];
  ordinary: Doc<"pages">["ordinary"];
  wordCount: number;
  extractedText: string;
  readability?: Doc<"pages">["readability"];
}

/** A book's difficulty measures, or null until it has a word estimate and enough text pages for vocabulary. */
export function bookDifficulty(pages: ComparisonPage[], totalPages: number | undefined, language: string) {
  const estimate = computeBookEstimate(pages, totalPages);
  if (estimate === null || estimate.totalWords === null) return null;
  const vocabulary = computeVocabularyStats(pages.map((p) => p.extractedText), totalPages, estimate.totalWords);
  if (vocabulary === null || vocabulary.projection === null) return null;

  // The growth curve runs in sampled pages; words per sampled text page converts it to running words
  const textPages = pages.filter((p) => vocabularyTokens(p.extractedText).length > 0);
  const wordsPerSampledPage = textPages.reduce((sum, p) => sum + countWords(p.extractedText), 0) / textPages.length;
  const { curve } = vocabulary;
  const reachesCommonLength = estimate.totalWords >= COMMON_LENGTH;
  const readability = language === "en" ? averageReadability(pages.flatMap((p) => (p.readability ? [p.readability] : []))) : null;

  return {
    // The whole-book numbers rest on the word estimate: hand-picked pages alone read high
    provisional: estimate.method === "chosen-pages",
    sendable: estimate.sendable,
    wordsPerPage: estimate.wordsPerPage,
    totalWords: estimate.totalWords,
    totalWordsLow: estimate.totalWordsLow!,
    totalWordsHigh: estimate.totalWordsHigh!,
    uniqueWords: vocabulary.projection.uniqueWords,
    uniqueWordsLow: vocabulary.projection.low,
    uniqueWordsHigh: vocabulary.projection.high,
    uniqueShare: vocabulary.projection.uniqueWords / estimate.totalWords,
    uniqueAtCommonLength: reachesCommonLength ? formsAfter(curve, wordsPerSampledPage, COMMON_LENGTH) : null,
    newPerThousandAtCommonLength: reachesCommonLength ? newFormsPerThousand(curve, wordsPerSampledPage, COMMON_LENGTH) : null,
    newPerThousandAtEnd: newFormsPerThousand(curve, wordsPerSampledPage, estimate.totalWords),
    distinctInRandomWords: distinctInRandomWords(textPages.flatMap((p) => vocabularyTokens(p.extractedText)), RANDOM_WORDS),
    fleschKincaidGrade: readability?.fleschKincaidGrade ?? null,
    // For the charts: the curve in sampled pages, and how many running words the sample and the book hold
    curve,
    wordsPerSampledPage,
    sampledWords: Math.round(textPages.length * wordsPerSampledPage),
    sampledPages: textPages.length,
  };
}

export type BookDifficulty = NonNullable<ReturnType<typeof bookDifficulty>>;
