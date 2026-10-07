/**
 * Book-level aggregate statistics computed from per-page results.
 */

import { getReadingLevel } from "./textAnalysis";
import type { Readability } from "./validators";

const round = (x: number, decimals: number) => Math.round(x * 10 ** decimals) / 10 ** decimals;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

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

// Target precision: ±10% at 95% confidence
const MARGIN_TARGET = 0.1;
const Z_95 = 1.96;

// Two-sided 95% critical values of Student's t for df = 1..30; beyond that z is close enough
const T_95 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131,
  2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];
const tCritical95 = (df: number) => T_95[df - 1] ?? Z_95;

// Relative 95% margin of error for n pages with coefficient of variation cv
const relativeMargin = (cv: number, n: number) => (tCritical95(n - 1) * cv) / Math.sqrt(n);

/** Smallest sample whose expected margin is within the target, using the same t-interval we report. */
function requiredSampleSize(cv: number): number {
  let n = 2;
  while (relativeMargin(cv, n) > MARGIN_TARGET) n++;
  return n;
}

export type ConfidenceLevel = "low" | "medium" | "high";

/**
 * Treat the uploaded pages as a random sample of the book and estimate mean words per page,
 * its 95% confidence interval (Student's t), and how many pages are needed for ±10% precision.
 */
export function computeSamplingStats(wordCounts: number[]) {
  const n = wordCounts.length;
  if (n < 2) return null;

  const m = mean(wordCounts);
  const stdDev = Math.sqrt(wordCounts.reduce((sum, x) => sum + (x - m) ** 2, 0) / (n - 1));
  const cv = m > 0 ? stdDev / m : 0;

  const recommendedSampleSize = requiredSampleSize(cv);
  const marginOfError = tCritical95(n - 1) * (stdDev / Math.sqrt(n));
  const marginFraction = m > 0 ? marginOfError / m : 0;

  // Confidence follows the precision actually achieved
  let confidenceLevel: ConfidenceLevel = "low";
  if (marginFraction <= MARGIN_TARGET) confidenceLevel = "high";
  else if (marginFraction <= 2 * MARGIN_TARGET) confidenceLevel = "medium";

  return {
    sampleSize: n,
    mean: round(m, 1),
    stdDev: round(stdDev, 1),
    cvPercent: round(cv * 100, 1),
    recommendedSampleSize,
    additionalPagesNeeded: Math.max(0, recommendedSampleSize - n),
    confidenceLevel,
    currentMarginPercent: round(marginFraction * 100, 1),
    ciLowerPerPage: Math.round(Math.max(0, m - marginOfError)),
    ciUpperPerPage: Math.round(m + marginOfError),
  };
}

export type SamplingStats = NonNullable<ReturnType<typeof computeSamplingStats>>;
