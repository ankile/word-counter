import { describe, expect, test } from "vitest";
import { averageReadability, computeBookEstimate, MIN_RANDOM_PAGES, type EstimatePage } from "./stats";
import { analyzeText } from "./textAnalysis";

const chosen = (...counts: number[]): EstimatePage[] =>
  counts.map((wordCount) => ({ origin: "chosen", ordinary: true, wordCount }));
const random = (ordinary: boolean, ...counts: number[]): EstimatePage[] =>
  counts.map((wordCount) => ({ origin: "random", ordinary, wordCount }));

// 6 ordinary random pages (mean 300, sd √200) and 2 other ones (0 and 100 words)
const RANDOM_SAMPLE = [...random(true, 300, 320, 280, 300, 310, 290), ...random(false, 0, 100)];

/**
 * 6 ordinary and 2 other random pages, all 300 ± spread words. With no gap between the strata the uncertainty in p
 * costs nothing, so the margin is set by the spread alone: Var = 0.175·spread², margin ≈ 0.34%·spread at df = 6.
 */
const evenSample = (spread: number) => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => 300 + (i % 2 === 0 ? spread : -spread));
  return [...random(true, ...words(6)), ...random(false, ...words(2))];
};

describe("computeBookEstimate", () => {
  test("needs two chosen pages, or three pages once random pages are in", () => {
    expect(computeBookEstimate(chosen(300), 200)).toBeNull();
    expect(computeBookEstimate([...chosen(300), ...random(true, 310)], 200)).toBeNull();
    expect(computeBookEstimate([...chosen(300, 290), ...random(true, 310)], 200)).not.toBeNull();
  });

  test("a chosen-only sample is the plain mean of every chosen page, flagged and not sendable", () => {
    const estimate = computeBookEstimate([...chosen(280, 300, 320), { origin: "chosen", ordinary: false, wordCount: 100 }], 200)!;
    expect(estimate.method).toBe("chosen-pages");
    expect(estimate.wordsPerPage).toBe(250);
    expect(estimate.ordinaryShare).toBeNull();
    expect(estimate.chosenPages).toBe(4);
    expect(estimate.sendable).toBe(false);
    expect(estimate.meetsRecommended).toBe(false);
    // Even a very tight chosen sample needs random pages before p can be estimated: more than the minimum, as
    // all-ordinary random pages leave p uncertain
    const tightPages = chosen(300, 301, 299, 300, 300, 301, 299, 300, 300, 300);
    const tight = computeBookEstimate(tightPages, 200)!;
    expect(tight.marginPercent).toBeLessThan(1);
    expect(tight.sendable).toBe(false);
    expect(tight.randomPagesForSendable).toBeGreaterThan(MIN_RANDOM_PAGES);
    expect(tight.totalWords).toBe(Math.round(tight.wordsPerPage * 200));
    // The projection assumes ordinary random pages: exactly that many of them make it sendable
    const withRandom = (k: number) => computeBookEstimate([...tightPages, ...random(true, ...new Array(k).fill(300))], 200)!;
    expect(withRandom(tight.randomPagesForSendable).sendable).toBe(true);
    expect(withRandom(tight.randomPagesForSendable - 1).sendable).toBe(false);
  });

  test("a random-only sample equals the plain mean, with the stratified (delta-method) margin", () => {
    const estimate = computeBookEstimate(RANDOM_SAMPLE, 400)!;
    expect(estimate.method).toBe("random-pages");
    expect(estimate.wordsPerPage).toBe(237.5); // (6 · 300 + 0 + 100) / 8
    expect(estimate.ordinaryShare).toBe(0.75);
    // Var = p²·200/6 + (1−p)²·5000/2 + (300 − 50)²·p̃(1−p̃)/8 with the Agresti–Coull p̃ = (6 + 2)/(8 + 4) = 2/3
    //     = 18.75 + 156.25 + 1736.11; t(df = 6) = 2.447
    const margin = (2.447 * Math.sqrt(18.75 + 156.25 + (62500 * (2 / 9)) / 8)) / 237.5;
    expect(estimate.marginPercent).toBeCloseTo(margin * 100, 1);
    expect(estimate.wordsPerPageLow).toBeCloseTo(237.5 * (1 - margin), 1);
    expect(estimate.wordsPerPageHigh).toBeCloseTo(237.5 * (1 + margin), 1);
    expect(estimate.totalWords).toBe(95000);
  });

  test("zero-word other pages pull the mean down from the chosen pages' level", () => {
    const chosenPages = chosen(300, 305, 295, 300);
    const withoutBlanks = computeBookEstimate([...chosenPages, ...random(true, 300, 300, 300, 300, 300, 300, 300, 300)], 400)!;
    const withBlanks = computeBookEstimate([...chosenPages, ...random(true, 300, 300, 300, 300, 300, 300), ...random(false, 0, 0)], 400)!;
    expect(withoutBlanks.wordsPerPage).toBe(300);
    expect(withBlanks.method).toBe("corrected-chosen");
    expect(withBlanks.ordinaryShare).toBe(0.75);
    expect(withBlanks.wordsPerPage).toBe(225);
  });

  test("chosen pages tighten mean_ordinary but never move p", () => {
    const randomOnly = computeBookEstimate(RANDOM_SAMPLE, 400)!;
    const corrected = computeBookEstimate([...RANDOM_SAMPLE, ...chosen(300, 300, 302, 298, 300, 301, 299, 300)], 400)!;
    expect(corrected.method).toBe("corrected-chosen");
    expect(corrected.chosenPages).toBe(8);
    expect(corrected.ordinaryShare).toBe(randomOnly.ordinaryShare);
    expect(corrected.marginPercent).toBeLessThan(randomOnly.marginPercent);
    // Pooled ordinary mean moves with the chosen pages; p does not, even if they are all marked not ordinary
    const lowChosen = computeBookEstimate([...RANDOM_SAMPLE, ...chosen(200, 200, 200, 200, 200, 200)], 400)!;
    expect(lowChosen.ordinaryShare).toBe(0.75);
    expect(lowChosen.wordsPerPage).toBe(0.75 * 250 + 0.25 * 50);
    const unticked = computeBookEstimate(
      [...RANDOM_SAMPLE, ...chosen(5, 10).map((p) => ({ ...p, ordinary: false }))],
      400
    )!;
    expect(unticked.ordinaryShare).toBe(0.75);
    expect(unticked.wordsPerPage).toBe(randomOnly.wordsPerPage);
    expect(unticked.method).toBe("random-pages");
    expect(unticked.chosenPages).toBe(0);
  });

  test("random pages that are all ordinary leave p uncertain, so the interval stays wide", () => {
    // Ten tight chosen pages and eight random ones, every one ordinary: p̂ = 1, but a blank page may be next
    const estimate = computeBookEstimate([...chosen(300, 305, 295, 300, 302, 298, 300, 301, 299, 300), ...random(true, 300, 310, 290, 305, 295, 300, 302, 298)], 400)!;
    expect(estimate.ordinaryShare).toBe(1);
    expect(estimate.wordsPerPage).toBe(300);
    expect(estimate.marginPercent).toBeGreaterThan(20);
    expect(estimate.sendable).toBe(false);
  });

  test("the ±20% and ±10% thresholds flip sendable and meetsRecommended", () => {
    const wide = computeBookEstimate(evenSample(75), 400)!;
    const medium = computeBookEstimate(evenSample(45), 400)!;
    const narrow = computeBookEstimate(evenSample(15), 400)!;
    expect(wide.marginPercent).toBeGreaterThan(20);
    expect([wide.sendable, wide.meetsRecommended]).toEqual([false, false]);
    expect(medium.marginPercent).toBeGreaterThan(10);
    expect(medium.marginPercent).toBeLessThanOrEqual(20);
    expect([medium.sendable, medium.meetsRecommended]).toEqual([true, false]);
    expect(narrow.marginPercent).toBeLessThanOrEqual(10);
    expect([narrow.sendable, narrow.meetsRecommended]).toEqual([true, true]);

    // Precise enough, but one random page short of the minimum
    const short = computeBookEstimate(evenSample(1).slice(1), 400)!;
    expect(short.marginPercent).toBeLessThan(1);
    expect(short.sendable).toBe(false);
    expect(short.randomPagesForSendable).toBe(1);
  });

  test("projects the random pages needed for each threshold, and 0 once met", () => {
    const estimate = computeBookEstimate(RANDOM_SAMPLE, 400)!;
    expect(estimate.randomPagesForSendable).toBeGreaterThan(0);
    expect(estimate.randomPagesForRecommended).toBeGreaterThan(estimate.randomPagesForSendable);
    // Adding that many pages in the same mix and spread lands within the target
    const k = estimate.randomPagesForRecommended;
    const more = Array.from({ length: Math.ceil(k / 8) }, () => RANDOM_SAMPLE).flat();
    expect(computeBookEstimate([...RANDOM_SAMPLE, ...more], 400)!.meetsRecommended).toBe(true);

    const narrow = computeBookEstimate(evenSample(15), 400)!;
    expect(narrow.meetsRecommended).toBe(true);
    expect([narrow.randomPagesForSendable, narrow.randomPagesForRecommended]).toEqual([0, 0]);
  });

  test("never asks for more random pages than the book has left", () => {
    // Too noisy for ±10% in a 12-page book: at most the 4 pages not yet drawn
    const estimate = computeBookEstimate(random(true, 100, 500, 100, 500, 100, 500, 100, 500), 12)!;
    expect(estimate.meetsRecommended).toBe(false);
    expect(estimate.randomPagesForRecommended).toBe(4);
  });

  test("totals need the page count", () => {
    const estimate = computeBookEstimate(chosen(280, 300, 320), undefined)!;
    expect(estimate.pageCountBasis).toBeNull();
    expect(estimate.totalWords).toBeNull();
  });
});

test("averageReadability averages metrics and derives level from mean ease", () => {
  expect(averageReadability([])).toBeNull();
  const a = analyzeText("The cat sat on the mat.");
  const b = analyzeText("Notwithstanding considerable organizational complexity, institutional transformation proceeded.");
  const avg = averageReadability([a, b])!;
  expect(avg.fleschReadingEase).toBeCloseTo((a.fleschReadingEase + b.fleschReadingEase) / 2, 1);
});
