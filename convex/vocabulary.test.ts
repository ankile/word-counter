import { describe, expect, test } from "vitest";
import {
  computeVocabularyStats,
  fitQuality,
  fitGrowthCurve,
  growthCurveAt,
  growthCurveMarginal,
  rarefactionCurve,
  vocabularyTokens,
} from "./vocabulary";

test("vocabularyTokens lowercases, splits hyphens, keeps contractions, drops possessives", () => {
  expect(vocabularyTokens("Bast’s well-funded inn. Don't; THE the 1984 café")).toEqual([
    "bast",
    "well",
    "funded",
    "inn",
    "don't",
    "the",
    "the",
    "café",
  ]);
});

test("rarefaction gives the exact expected distinct words in k random pages", () => {
  // a on both pages, b and c on one each: one page has 2 distinct words, both pages have 3
  const curve = rarefactionCurve([new Set(["a", "b"]), new Set(["a", "c"])]);
  expect(curve[0]).toBeCloseTo(2);
  expect(curve[1]).toBeCloseTo(3);
});

describe("growth curve", () => {
  test("recovers the coefficients of an exact log-quadratic curve", () => {
    const truth: [number, number, number] = [5.4, 0.8, -0.03];
    const points = Array.from({ length: 12 }, (_, i) => ({ x: i + 1, y: growthCurveAt(truth, i + 1) }));
    const [a, b, c] = fitGrowthCurve(points);
    expect(a).toBeCloseTo(truth[0], 6);
    expect(b).toBeCloseTo(truth[1], 6);
    expect(c).toBeCloseTo(truth[2], 6);
  });

  test("fit quality is perfect on an exact curve and reports the worst residual otherwise", () => {
    const truth: [number, number, number] = [5, 0.8, -0.02];
    const exact = Array.from({ length: 10 }, (_, i) => growthCurveAt(truth, i + 1));
    expect(fitQuality(truth, exact).r2).toBeCloseTo(1, 10);
    expect(fitQuality(truth, exact).maxResidualPercent).toBeCloseTo(0, 10);
    const bumped = exact.map((v, i) => (i === 4 ? v * 1.1 : v));
    expect(fitQuality(truth, bumped).maxResidualPercent).toBeCloseTo(10, 6);
    expect(fitQuality(truth, bumped).r2).toBeLessThan(1);
  });

  test("holds vocabulary flat past the curve's peak instead of letting it shrink", () => {
    const bending: [number, number, number] = [5, 1, -0.2]; // peaks at log k = 2.5
    expect(growthCurveAt(bending, 1000)).toBeCloseTo(growthCurveAt(bending, Math.exp(2.5)));
    expect(growthCurveMarginal(bending, 1000)).toBeCloseTo(0);
  });
});

describe("computeVocabularyStats", () => {
  // Letters-only word for an integer id ("a", "b", ..., "ba", ...)
  const word = (id: number): string => (id < 26 ? "" : word(Math.floor(id / 26) - 1)) + String.fromCharCode(97 + (id % 26));
  // Zipf-like pages: a few words recur everywhere, most are rare
  let seed = 1;
  const random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pages = Array.from({ length: 12 }, () =>
    Array.from({ length: 300 }, () => word(Math.floor(1 / (random() + 0.0005)))).join(" ")
  );

  test("needs at least four pages", () => {
    expect(computeVocabularyStats(pages.slice(0, 3), 300)).toBeNull();
    expect(computeVocabularyStats(pages.slice(0, 4), 300)).not.toBeNull();
  });

  test("reports what was seen, the growth curve, and a range around the projection", () => {
    const stats = computeVocabularyStats(pages, 300)!;
    expect(stats.seenUniqueWords).toBe(new Set(pages.flatMap(vocabularyTokens)).size);
    expect(stats.rarefied).toHaveLength(12);
    expect(stats.rarefied.reduce((s, p) => s + p.marginal, 0)).toBeCloseTo(stats.seenUniqueWords, 0);
    const { uniqueWords, low, high } = stats.projection!;
    expect(uniqueWords).toBeGreaterThan(stats.seenUniqueWords);
    expect(low).toBeLessThan(uniqueWords);
    expect(high).toBeGreaterThan(uniqueWords);
    expect(stats.fitQuality.r2).toBeGreaterThan(0.99);
    // The range uses whichever uncertainty is larger
    const { leaveOneOutPercent, calibratedPercent } = stats.projection!;
    expect(Math.max(leaveOneOutPercent, calibratedPercent)).toBeGreaterThan(0);
    expect(calibratedPercent).toBeCloseTo(100 * (Math.exp(0.72 / Math.sqrt(12)) - 1), 6);
  });

  test("extrapolates to the book's estimated words, not its page count", () => {
    const byPages = computeVocabularyStats(pages, 300)!.projection!;
    expect(byPages.pages).toBe(300);
    // Sampled pages hold 300 words; a book of 300 pages averaging 240 words holds 240 of them
    const byWords = computeVocabularyStats(pages, 300, 72_000)!.projection!;
    expect(byWords.totalPages).toBe(300);
    expect(byWords.pages).toBe(240);
    expect(byWords.uniqueWords).toBe(Math.round(growthCurveAt(computeVocabularyStats(pages, 300)!.curve, 240)));
    expect(byWords.uniqueWords).toBeLessThan(byPages.uniqueWords);
    // An estimate at the sampled pages' own density reads off at the page count
    expect(computeVocabularyStats(pages, 300, 90_000)!.projection!.uniqueWords).toBe(byPages.uniqueWords);
  });

  test("skips the projection without the book's page count", () => {
    expect(computeVocabularyStats(pages, undefined)!.projection).toBeNull();
  });
});
