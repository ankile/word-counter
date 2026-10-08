import { describe, expect, test } from "vitest";
import { averageReadability, computeBookEstimate, MIN_RANDOM_PAGES, type EstimatePage } from "./stats";
import { analyzeText } from "./textAnalysis";

const chosen = (...counts: number[]): EstimatePage[] =>
  counts.map((wordCount) => ({ origin: "chosen", ordinary: true, wordCount }));
const random = (ordinary: boolean, ...counts: number[]): EstimatePage[] =>
  counts.map((wordCount) => ({ origin: "random", ordinary, wordCount }));

// 6 ordinary random pages (mean 300, sd √200) and 2 other ones (0 and 100 words)
const RANDOM_SAMPLE = [...random(true, 300, 320, 280, 300, 310, 290), ...random(false, 0, 100)];

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
    // Even a very tight chosen sample needs the minimum random pages before p can be estimated
    const tight = computeBookEstimate(chosen(300, 301, 299, 300, 300, 301, 299, 300, 300, 300), 200)!;
    expect(tight.marginPercent).toBeLessThan(1);
    expect(tight.sendable).toBe(false);
    expect(tight.randomPagesForSendable).toBe(MIN_RANDOM_PAGES);
    expect(tight.totalWords).toBe(Math.round(tight.wordsPerPage * 200));
  });

  test("a random-only sample equals the plain mean, with the stratified (delta-method) margin", () => {
    const estimate = computeBookEstimate(RANDOM_SAMPLE, 400)!;
    expect(estimate.method).toBe("random-pages");
    expect(estimate.wordsPerPage).toBe(237.5); // (6 · 300 + 0 + 100) / 8
    expect(estimate.ordinaryShare).toBe(0.75);
    // Var = p²·200/6 + (1−p)²·5000/2 + (300 − 50)²·p(1−p)/8 = 18.75 + 156.25 + 1464.84; t(df = 6) = 2.447
    const margin = (2.447 * Math.sqrt(18.75 + 156.25 + 1464.84375)) / 237.5;
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

  test("the ±20% and ±10% thresholds flip sendable and meetsRecommended", () => {
    const pages = (spread: number) =>
      random(true, ...Array.from({ length: MIN_RANDOM_PAGES }, (_, i) => 300 + (i % 2 === 0 ? spread : -spread)));
    // sd ≈ spread · 1.07, margin ≈ 2.447 · sd / √8 / 300
    const wide = computeBookEstimate(pages(80), 400)!;
    const medium = computeBookEstimate(pages(45), 400)!;
    const narrow = computeBookEstimate(pages(20), 400)!;
    expect(wide.marginPercent).toBeGreaterThan(20);
    expect([wide.sendable, wide.meetsRecommended]).toEqual([false, false]);
    expect(medium.marginPercent).toBeGreaterThan(10);
    expect(medium.marginPercent).toBeLessThanOrEqual(20);
    expect([medium.sendable, medium.meetsRecommended]).toEqual([true, false]);
    expect(narrow.marginPercent).toBeLessThanOrEqual(10);
    expect([narrow.sendable, narrow.meetsRecommended]).toEqual([true, true]);

    // Precise enough, but one random page short of the minimum
    const short = computeBookEstimate(random(true, 300, 301, 299, 300, 300, 301, 299), 400)!;
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

    const narrow = computeBookEstimate(random(true, 300, 320, 280, 300, 310, 290, 305, 295), 400)!;
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
