import { describe, expect, test } from "vitest";
import {
  bookDifficulty,
  COMMON_LENGTH,
  distinctInRandomWords,
  formsAfter,
  growthCurveSlope,
  newFormsPerThousand,
  type ComparisonPage,
} from "./difficulty";
import { analyzeText } from "./textAnalysis";
import { growthCurveAt, type GrowthCurve } from "./vocabulary";

test("distinct forms in m random words is Hurlbert's rarefaction of the sample", () => {
  const tokens = ["a", "a", "b", "c"];
  // Drawing all four words sees all three forms; drawing one sees one
  expect(distinctInRandomWords(tokens, 4)).toBeCloseTo(3, 10);
  expect(distinctInRandomWords(tokens, 1)).toBeCloseTo(1, 10);
  // Two of four: a is missed with C(2,2)/C(4,2) = 1/6, b and c each with C(3,2)/C(4,2) = 1/2
  expect(distinctInRandomWords(tokens, 2)).toBeCloseTo(5 / 6 + 1 / 2 + 1 / 2, 10);
  // A sample smaller than the window can't be measured there
  expect(distinctInRandomWords(tokens, 5)).toBeNull();
});

test("the growth-curve slope is the derivative of the curve, and zero past its peak", () => {
  const curve: GrowthCurve = [4.2, 0.85, -0.02];
  for (const k of [1.5, 10, 120]) {
    const h = 1e-4 * k;
    expect(growthCurveSlope(curve, k)).toBeCloseTo((growthCurveAt(curve, k + h) - growthCurveAt(curve, k - h)) / (2 * h), 6);
  }
  // The peak of log V in log k is at ln k = −b / 2c = 21.25; beyond it vocabulary is held flat
  expect(growthCurveSlope(curve, Math.exp(22))).toBe(0);
  // In running words: per 1,000 words is the slope per sampled page over words per page
  expect(newFormsPerThousand(curve, 250, 25_000)).toBeCloseTo((growthCurveSlope(curve, 100) / 250) * 1000, 10);
  expect(formsAfter(curve, 250, 25_000)).toBeCloseTo(growthCurveAt(curve, 100), 10);
});

// Synthetic pages with Zipf-like word use: a shared core vocabulary plus words new to each page, so the vocabulary
// keeps growing the way a book's does
// Letters only, so each made-up word is exactly one token
const letters = (i: number): string => (i < 26 ? "" : letters(Math.floor(i / 26) - 1)) + String.fromCharCode(97 + (i % 26));
const LEXICON = Array.from({ length: 4000 }, (_, i) => `q${letters(i)}`);
function page(seed: number, words: number): string {
  let state = seed * 7919 + 1;
  const next = () => (state = (state * 48271) % 2147483647) / 2147483647;
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(LEXICON[Math.floor(LEXICON.length * next() ** 3)]);
  return out.join(" ") + ".";
}
const pages = (n: number, origin: "chosen" | "random", words = 300): ComparisonPage[] =>
  Array.from({ length: n }, (_, i) => {
    const extractedText = page(i + (origin === "random" ? 1000 : 0), words);
    return { origin, ordinary: null, wordCount: words, extractedText, readability: analyzeText(extractedText) };
  });

describe("bookDifficulty", () => {
  test("measures a random sample at the common length, the end of the book and in 1,000 random words", () => {
    const sample = pages(12, "random");
    const difficulty = bookDifficulty(sample, 600, "en")!;
    expect(difficulty.provisional).toBe(false);
    expect(difficulty.totalWords).toBe(180_000);
    expect(difficulty.wordsPerSampledPage).toBeCloseTo(300, 0);
    expect(difficulty.sampledWords).toBe(Math.round(12 * difficulty.wordsPerSampledPage));
    // The common-length measures read the fitted curve at 50,000 words
    expect(difficulty.uniqueAtCommonLength).toBeCloseTo(formsAfter(difficulty.curve, difficulty.wordsPerSampledPage, COMMON_LENGTH), 6);
    expect(difficulty.newPerThousandAtCommonLength).toBeCloseTo(newFormsPerThousand(difficulty.curve, difficulty.wordsPerSampledPage, COMMON_LENGTH), 6);
    // New words come slower by the end of a 180,000-word book than at 50,000
    expect(difficulty.newPerThousandAtEnd).toBeLessThan(difficulty.newPerThousandAtCommonLength!);
    expect(difficulty.uniqueShare).toBeCloseTo(difficulty.uniqueWords / 180_000, 10);
    expect(difficulty.distinctInRandomWords).toBeGreaterThan(0);
    expect(difficulty.distinctInRandomWords).toBeLessThanOrEqual(1000);
    expect(difficulty.fleschKincaidGrade).not.toBeNull();
  });

  test("a book shorter than the common length isn't measured there, and Flesch is English-only", () => {
    // 12 pages × 300 words on a 100-page book: 30,000 words
    const short = bookDifficulty(pages(12, "random"), 100, "no")!;
    expect(short.totalWords).toBe(30_000);
    expect(short.uniqueAtCommonLength).toBeNull();
    expect(short.newPerThousandAtCommonLength).toBeNull();
    expect(short.fleschKincaidGrade).toBeNull();
  });

  test("a blank random page counts toward the estimate but not toward words per page of text", () => {
    const blank: ComparisonPage = { origin: "random", ordinary: null, wordCount: 0, extractedText: "" };
    const withBlank = bookDifficulty([...pages(12, "random"), blank], 600, "en")!;
    expect(withBlank.wordsPerSampledPage).toBeCloseTo(300, 0);
    expect(withBlank.sampledPages).toBe(12);
    // The blank page still pulls the whole-book estimate down
    expect(withBlank.totalWords).toBeLessThan(bookDifficulty(pages(12, "random"), 600, "en")!.totalWords);
  });

  test("hand-picked pages alone give provisional whole-book numbers", () => {
    expect(bookDifficulty(pages(6, "chosen"), 400, "en")!.provisional).toBe(true);
  });

  test("needs a page count, four pages of text, and 1,000 sampled words for the random-word measure", () => {
    expect(bookDifficulty(pages(12, "random"), undefined, "en")).toBeNull();
    expect(bookDifficulty(pages(3, "random"), 400, "en")).toBeNull();
    // Four pages of 200 words: vocabulary is measured, but 800 words can't be drawn from 1,000 times
    const small = bookDifficulty(pages(4, "random", 200), 400, "en")!;
    expect(small.distinctInRandomWords).toBeNull();
  });
});
