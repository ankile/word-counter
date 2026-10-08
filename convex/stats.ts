/**
 * Book-level aggregate statistics computed from per-page results.
 */

import { COUNTING_VERSION, getReadingLevel } from "./textAnalysis";
import type { PageOrigin, Readability } from "./validators";

const round = (x: number, decimals: number) => Math.round(x * 10 ** decimals) / 10 ** decimals;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sampleVariance = (xs: number[]) => {
  const m = mean(xs);
  return xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1);
};

export function averageReadability(readabilities: Readability[]) {
  if (readabilities.length === 0) return null;
  const avgOf = (key: keyof Omit<Readability, "readingLevel">) => mean(readabilities.map((r) => r[key]));
  const fleschReadingEase = avgOf("fleschReadingEase");
  return {
    fleschReadingEase: round(fleschReadingEase, 1),
    fleschKincaidGrade: round(avgOf("fleschKincaidGrade"), 1),
    avgWordsPerSentence: round(avgOf("avgWordsPerSentence"), 1),
    avgSyllablesPerWord: round(avgOf("avgSyllablesPerWord"), 2),
    readingLevel: getReadingLevel(fleschReadingEase),
  };
}

// Random pages needed before the share of ordinary pages can be estimated at all
export const MIN_RANDOM_PAGES = 8;
// 95% margins: Book Tracker accepts up to ±20%; ±10% is recommended
export const MARGIN_SENDABLE = 0.2;
export const MARGIN_RECOMMENDED = 0.1;
const Z_95 = 1.96;

// Two-sided 95% critical values of Student's t for df = 1..30; beyond that z is close enough
const T_95 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131,
  2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];
const tCritical95 = (df: number) => T_95[df - 1] ?? Z_95;

export interface EstimatePage {
  origin: PageOrigin;
  ordinary: boolean;
  wordCount: number;
}

/** Stratum means and variances; with p = 1 and no other pages it is a plain mean of the ordinary pages. */
interface Moments {
  p: number;
  meanOrd: number;
  meanOth: number;
  varOrd: number;
  varOth: number;
  // Pages used: the variance counts may be fractional in projections
  nOrd: number;
  nOth: number;
  nRandom: number;
  // Degrees of freedom are pages used minus this (one per estimated mean)
  dfLoss: number;
}

const wordsPerPageOf = (m: Moments) => m.p * m.meanOrd + (1 - m.p) * m.meanOth;

/** 95% relative margin of the stratified (delta-method) estimate, with k more random pages split p : 1 − p. */
function marginWithMore(m: Moments, k: number): number {
  const nOrd = m.nOrd + m.p * k;
  const nOth = m.nOth + (1 - m.p) * k;
  const nRandom = m.nRandom + k;
  const variance =
    (m.p > 0 ? (m.p ** 2 * m.varOrd) / nOrd : 0) +
    (m.p < 1 ? ((1 - m.p) ** 2 * m.varOth) / nOth : 0) +
    (nRandom > 0 ? ((m.meanOrd - m.meanOth) ** 2 * m.p * (1 - m.p)) / nRandom : 0);
  const wordsPerPage = wordsPerPageOf(m);
  const df = Math.round(nOrd + nOth) - m.dfLoss;
  return wordsPerPage > 0 ? (tCritical95(df) * Math.sqrt(variance)) / wordsPerPage : 0;
}

/** Smallest number of additional random pages (≥ minK) whose projected margin is within the target. */
function randomPagesToReach(m: Moments, target: number, minK: number, maxK: number): number {
  for (let k = minK; k < maxK; k++) {
    if (marginWithMore(m, k) <= target) return k;
  }
  return Math.max(minK, maxK);
}

export type EstimateMethod = "random-pages" | "corrected-chosen" | "chosen-pages";

/**
 * Average words per printed page of the book, from its OCR'd pages (docs/book-tracker-word-estimates.md):
 *
 *   wordsPerPage = p · mean_ordinary + (1 − p) · mean_other
 *
 * p (the share of ordinary pages) and mean_other come from random pages only; mean_ordinary pools hand-chosen
 * and random ordinary pages. Hand-chosen pages that aren't ordinary have no unbiased place in the estimate and
 * are left out. Without random pages the plain mean of the chosen pages is reported, which reads high
 * because blanks, chapter openings and illustrations are missing from it.
 *
 * Returns null until there are enough pages for a 95% interval (2 chosen, or 3 once random pages are in).
 */
export function computeBookEstimate(pages: EstimatePage[], totalPages: number | undefined) {
  const random = pages.filter((p) => p.origin === "random");
  const chosen = pages.filter((p) => p.origin === "chosen");
  const words = (ps: EstimatePage[]) => ps.map((p) => p.wordCount);
  // Pages a random draw could still land on
  const maxK = (totalPages ?? Infinity) - random.length;

  let method: EstimateMethod;
  let used: EstimatePage[];
  let moments: Moments;
  // Moments for projecting how many random pages are needed; differ from `moments` only for chosen-pages
  let projection: Moments;
  if (random.length === 0) {
    if (chosen.length < 2) return null;
    method = "chosen-pages";
    used = chosen;
    const all = words(chosen);
    moments = {
      p: 1,
      meanOrd: mean(all),
      meanOth: 0,
      varOrd: sampleVariance(all),
      varOth: 0,
      nOrd: all.length,
      nOth: 0,
      nRandom: 0,
      dfLoss: 1,
    };
    // Random pages to come are assumed ordinary, so they tighten the same mean (two means once p is estimated)
    projection = { ...moments, dfLoss: 2 };
  } else {
    const ordinary = words([...chosen, ...random].filter((p) => p.ordinary));
    const other = words(random.filter((p) => !p.ordinary));
    used = [...chosen.filter((p) => p.ordinary), ...random];
    if (used.length < 3) return null;
    method = chosen.some((p) => p.ordinary) ? "corrected-chosen" : "random-pages";
    // Fewer than 2 pages in a stratum: borrow the spread of all random pages (or of all pages used)
    const fallbackVariance = sampleVariance(random.length >= 2 ? words(random) : words(used));
    moments = {
      p: (random.length - other.length) / random.length,
      meanOrd: ordinary.length > 0 ? mean(ordinary) : 0,
      meanOth: other.length > 0 ? mean(other) : 0,
      varOrd: ordinary.length >= 2 ? sampleVariance(ordinary) : fallbackVariance,
      varOth: other.length >= 2 ? sampleVariance(other) : fallbackVariance,
      nOrd: ordinary.length,
      nOth: other.length,
      nRandom: random.length,
      dfLoss: 2,
    };
    projection = moments;
  }

  const wordsPerPage = wordsPerPageOf(moments);
  const margin = marginWithMore(moments, 0);
  const marginAbsolute = margin * wordsPerPage;
  // The minimum random pages also rule out chosen-pages estimates
  const sendable = random.length >= MIN_RANDOM_PAGES && margin <= MARGIN_SENDABLE;
  const minK = Math.max(0, MIN_RANDOM_PAGES - random.length);
  const low = Math.max(0, wordsPerPage - marginAbsolute);
  const high = wordsPerPage + marginAbsolute;

  return {
    method,
    chosenPages: used.length - random.length,
    randomPages: random.length,
    ordinaryShare: method === "chosen-pages" ? null : round(moments.p, 3),
    wordsPerPage: round(wordsPerPage, 1),
    wordsPerPageLow: round(low, 1),
    wordsPerPageHigh: round(high, 1),
    marginPercent: round(margin * 100, 1),
    sendable,
    meetsRecommended: sendable && margin <= MARGIN_RECOMMENDED,
    randomPagesForSendable: randomPagesToReach(projection, MARGIN_SENDABLE, minK, maxK),
    randomPagesForRecommended: randomPagesToReach(projection, MARGIN_RECOMMENDED, minK, maxK),
    pageCountBasis: totalPages ?? null,
    totalWords: totalPages === undefined ? null : Math.round(wordsPerPage * totalPages),
    totalWordsLow: totalPages === undefined ? null : Math.round(low * totalPages),
    totalWordsHigh: totalPages === undefined ? null : Math.round(high * totalPages),
    countingVersion: COUNTING_VERSION,
  };
}

export type BookEstimate = NonNullable<ReturnType<typeof computeBookEstimate>>;
