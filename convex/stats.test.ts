import { describe, expect, test } from "vitest";
import { averageReadability, computeSamplingStats } from "./stats";
import { analyzeText } from "./textAnalysis";

describe("computeSamplingStats", () => {
  test("needs at least two pages", () => {
    expect(computeSamplingStats([])).toBeNull();
    expect(computeSamplingStats([300])).toBeNull();
  });

  test("uses Student's t for small samples", () => {
    // mean 300, sample sd 20, n = 3 → margin = t(2) * 20 / sqrt(3) = 4.303 * 11.547 ≈ 49.7
    const stats = computeSamplingStats([280, 300, 320])!;
    expect(stats.mean).toBe(300);
    expect(stats.stdDev).toBe(20);
    expect(stats.ciLowerPerPage).toBe(250);
    expect(stats.ciUpperPerPage).toBe(350);
    expect(stats.currentMarginPercent).toBe(16.6);
  });

  test("recommends sample size for ±10% precision", () => {
    // cv = 20/300 → n = ceil((1.96 * 0.0667 / 0.1)^2) = 2, already satisfied
    const stats = computeSamplingStats([280, 300, 320])!;
    expect(stats.recommendedSampleSize).toBe(2);
    expect(stats.additionalPagesNeeded).toBe(0);
    expect(stats.confidenceLevel).toBe("high");

    // cv = 50% → n = ceil(9.8^2) = 97
    const noisy = computeSamplingStats([100, 300])!;
    expect(noisy.recommendedSampleSize).toBeGreaterThan(50);
    expect(noisy.confidenceLevel).toBe("low");
  });
});

test("averageReadability averages metrics and derives level from mean ease", () => {
  expect(averageReadability([])).toBeNull();
  const a = analyzeText("The cat sat on the mat.");
  const b = analyzeText("Notwithstanding considerable organizational complexity, institutional transformation proceeded.");
  const avg = averageReadability([a, b])!;
  expect(avg.fleschReadingEase).toBeCloseTo((a.fleschReadingEase + b.fleschReadingEase) / 2, 1);
});
