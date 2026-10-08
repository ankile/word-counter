/**
 * Vocabulary growth: how many distinct words a book uses, extrapolated from a sample of pages.
 *
 * 1. Rarefaction turns the sampled pages into an order-independent growth curve: V(k) is the expected
 *    number of distinct words in k pages drawn at random from the sample.
 * 2. A Heaps'-law curve with a slowing exponent, log V = a + b·log k + c·(log k)², is fitted by least
 *    squares and extrapolated to the book's page count. (Plain Heaps' law, V = K·k^β, overestimates whole-book
 *    vocabulary by 1.5–2× because the growth exponent keeps falling; see docs/vocabulary.md.)
 * 3. The 95% range uses the error measured on full public-domain novels (log-error sd ≈ 0.72/√n), or the
 *    leave-one-page-out jackknife if this sample is noisier.
 */

import { countWords } from "./textAnalysis";

export const MIN_VOCABULARY_PAGES = 4;
const Z_95 = 1.96;
// Calibrated on 10 Project Gutenberg novels (scripts/validateVocabulary.ts)
const CALIBRATED_LOG_SD = 0.72;

/** Lowercased word forms: letters and inner apostrophes; hyphenated words split; possessive 's dropped. */
export function vocabularyTokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .match(/\p{L}+(?:'\p{L}+)*/gu)
      ?.map((word) => word.replace(/'s$/, "")) ?? []
  );
}

/**
 * Expected distinct words in k random pages out of n, for k = 1..n. A word on d of the n pages is
 * missed by a k-page draw with probability C(n−d, k) / C(n, k).
 */
export function rarefactionCurve(pages: Set<string>[]): number[] {
  const n = pages.length;
  const pagesPerWord = new Map<string, number>();
  for (const page of pages) for (const word of page) pagesPerWord.set(word, (pagesPerWord.get(word) ?? 0) + 1);
  // Words grouped by how many pages they appear on
  const wordsOnDPages = new Map<number, number>();
  for (const d of pagesPerWord.values()) wordsOnDPages.set(d, (wordsOnDPages.get(d) ?? 0) + 1);

  return Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    let expected = 0;
    for (const [d, count] of wordsOnDPages) {
      let missed = 1;
      for (let j = 0; j < k && missed > 0; j++) missed *= Math.max(0, n - d - j) / (n - j);
      expected += count * (1 - missed);
    }
    return expected;
  });
}

/** Coefficients [a, b, c] of log V = a + b·log k + c·(log k)². */
export type GrowthCurve = [number, number, number];

/** Least-squares fit of log y = a + b·log x + c·(log x)² (normal equations, Cramer's rule). */
export function fitGrowthCurve(points: { x: number; y: number }[]): GrowthCurve {
  const logs = points.map(({ x, y }) => [Math.log(x), Math.log(y)] as const);
  const sum = (f: (p: readonly [number, number]) => number) => logs.reduce((s, p) => s + f(p), 0);
  const [s0, s1, s2, s3, s4] = [0, 1, 2, 3, 4].map((e) => sum(([l]) => l ** e));
  const rhs = [0, 1, 2].map((e) => sum(([l, v]) => l ** e * v));
  const m = [
    [s0, s1, s2],
    [s1, s2, s3],
    [s2, s3, s4],
  ];
  const det = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  return [0, 1, 2].map((j) => det(m.map((row, i) => row.map((v, k) => (k === j ? rhs[i] : v)))) / d) as GrowthCurve;
}

/** Fitted distinct words after k pages. Past the curve's peak (if it bends down) vocabulary is held flat. */
export function growthCurveAt([a, b, c]: GrowthCurve, k: number): number {
  const l = Math.log(k);
  const capped = c < 0 ? Math.min(l, -b / (2 * c)) : l;
  return Math.exp(a + b * capped + c * capped * capped);
}

/** Fitted new distinct words on page k. */
export const growthCurveMarginal = (curve: GrowthCurve, k: number) =>
  growthCurveAt(curve, k) - (k > 1 ? growthCurveAt(curve, k - 1) : 0);

function fitPages(pages: Set<string>[]) {
  const rarefied = rarefactionCurve(pages);
  return { rarefied, fit: fitGrowthCurve(rarefied.map((y, i) => ({ x: i + 1, y }))) };
}

/** How well the curve matches the rarefied points it was fitted to (residuals in log space). */
export function fitQuality(curve: GrowthCurve, rarefied: number[]) {
  const logs = rarefied.map(Math.log);
  const residuals = logs.map((y, i) => y - Math.log(growthCurveAt(curve, i + 1)));
  const mean = logs.reduce((s, y) => s + y, 0) / logs.length;
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const ssTot = logs.reduce((s, y) => s + (y - mean) ** 2, 0);
  return {
    r2: 1 - ssRes / ssTot,
    rmsResidualPercent: 100 * (Math.exp(Math.sqrt(ssRes / residuals.length)) - 1),
    maxResidualPercent: 100 * Math.max(...residuals.map((r) => Math.abs(Math.exp(r) - 1))),
  };
}

/**
 * The growth curve is in sampled pages, so it is extrapolated to as many of them as hold the book's text: given the
 * book's estimated word count, totalWords / (mean words per sampled page). Hand-picked full pages then don't inflate
 * the projection, and it agrees with wordsPerPage × pageCount. Without a word estimate, to the page count.
 */
export function computeVocabularyStats(pageTexts: string[], totalPages: number | undefined, totalWords?: number) {
  const n = pageTexts.length;
  if (n < MIN_VOCABULARY_PAGES) return null;

  const pages = pageTexts.map((text) => new Set(vocabularyTokens(text)));
  const { rarefied, fit } = fitPages(pages);
  const sampledWordsPerPage = pageTexts.reduce((sum, text) => sum + countWords(text), 0) / n;
  const horizon = totalWords === undefined ? totalPages : Math.round(totalWords / sampledWordsPerPage);

  let projection = null;
  if (totalPages !== undefined && horizon !== undefined && horizon >= n) {
    const logEstimate = Math.log(growthCurveAt(fit, horizon));
    const leaveOneOut = pages.map((_, i) =>
      Math.log(growthCurveAt(fitPages(pages.filter((__, j) => j !== i)).fit, horizon))
    );
    const meanLoo = leaveOneOut.reduce((s, x) => s + x, 0) / n;
    const jackknifeSd = Math.sqrt(((n - 1) / n) * leaveOneOut.reduce((s, x) => s + (x - meanLoo) ** 2, 0));
    const calibratedSd = CALIBRATED_LOG_SD / Math.sqrt(n);
    const sd = Math.max(jackknifeSd, calibratedSd);
    projection = {
      totalPages,
      // Sampled pages' worth of text in the book, where the curve is read off (≈ totalPages for an unbiased sample)
      pages: horizon,
      totalWords: totalWords ?? null,
      uniqueWords: Math.round(Math.exp(logEstimate)),
      low: Math.round(Math.exp(logEstimate - Z_95 * sd)),
      high: Math.round(Math.exp(logEstimate + Z_95 * sd)),
      // One-sd uncertainty as ±%: from leaving out each page, and as measured on full novels
      leaveOneOutPercent: 100 * (Math.exp(jackknifeSd) - 1),
      calibratedPercent: 100 * (Math.exp(calibratedSd) - 1),
    };
  }

  const [, b, c] = fit;
  return {
    sampledPages: n,
    // Distinct words across all sampled pages (exact: V(n))
    seenUniqueWords: Math.round(rarefied[n - 1]),
    // Expected distinct words after k sampled pages, and the new words the k-th page adds
    rarefied: rarefied.map((cumulative, i) => ({
      page: i + 1,
      cumulative: Math.round(cumulative * 10) / 10,
      marginal: Math.round((cumulative - (i > 0 ? rarefied[i - 1] : 0)) * 10) / 10,
    })),
    curve: fit,
    fitQuality: fitQuality(fit, rarefied),
    // Local Heaps exponent d log V / d log k at the last sampled page (1 = every word new, 0 = none)
    growthExponent: Math.round((b + 2 * c * Math.log(n)) * 1000) / 1000,
    projection,
  };
}

export type VocabularyStats = NonNullable<ReturnType<typeof computeVocabularyStats>>;
