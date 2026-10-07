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

  test("recommends a sample size reaching ±10% under the same t-interval", () => {
    // cv = 6.67%: margins are 60% (n=2), 16.6% (n=3), 10.6% (n=4), 8.3% (n=5)
    const stats = computeSamplingStats([280, 300, 320])!;
    expect(stats.recommendedSampleSize).toBe(5);
    expect(stats.additionalPagesNeeded).toBe(2);
    expect(stats.confidenceLevel).toBe("medium");

    const noisy = computeSamplingStats([100, 300])!;
    expect(noisy.recommendedSampleSize).toBeGreaterThan(50);
    expect(noisy.confidenceLevel).toBe("low");
  });

  test("confidence is high only once the achieved margin is within ±10%", () => {
    // Two near-identical pages still have a wide t-interval (df = 1)
    const twoPages = computeSamplingStats([122, 115])!;
    expect(twoPages.currentMarginPercent).toBeGreaterThan(10);
    expect(twoPages.confidenceLevel).not.toBe("high");
    expect(twoPages.additionalPagesNeeded).toBeGreaterThan(0);

    const steady = computeSamplingStats([300, 305, 295, 302, 298, 301])!;
    expect(steady.currentMarginPercent).toBeLessThanOrEqual(10);
    expect(steady.confidenceLevel).toBe("high");
    expect(steady.additionalPagesNeeded).toBe(0);
  });
});

test("averageReadability averages metrics and derives level from mean ease", () => {
  expect(averageReadability([])).toBeNull();
  const a = analyzeText("The cat sat on the mat.");
  const b = analyzeText("Notwithstanding considerable organizational complexity, institutional transformation proceeded.");
  const avg = averageReadability([a, b])!;
  expect(avg.fleschReadingEase).toBeCloseTo((a.fleschReadingEase + b.fleschReadingEase) / 2, 1);
});
