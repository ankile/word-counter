import { describe, expect, test } from "vitest";
import { buildWordEstimatePayload, publishBlocker, samePayload, type PublishInput } from "./publish";
import { computeBookEstimate, MIN_RANDOM_PAGES, type EstimatePage } from "./stats";
import { analyzeText } from "./textAnalysis";

const random = (ordinary: boolean, ...counts: number[]): EstimatePage[] =>
  counts.map((wordCount) => ({ origin: "random", ordinary, wordCount }));

// Six ordinary pages and two others of similar length: tight enough for ±10%
const SENDABLE = computeBookEstimate([...random(true, 300, 320, 280, 300, 310, 290), ...random(false, 295, 305)], 400)!;
const readability = { ...analyzeText("The cat sat on the mat."), readingLevel: "Very Easy (5th grade)" };

const input = (overrides: Partial<PublishInput> = {}): PublishInput => ({
  trackerBookId: "tracker-1",
  editionId: "edition_1",
  totalPages: 400,
  estimate: SENDABLE,
  randomPages: SENDABLE.randomPages,
  stalePages: 0,
  openGrowthSlots: 0,
  language: "en",
  readability,
  vocabulary: null,
  ...overrides,
});

describe("publishBlocker", () => {
  test("is null for a linked book with a sendable estimate", () => {
    expect(SENDABLE.sendable).toBe(true);
    expect(publishBlocker(input())).toBeNull();
  });

  test("asks to link the book to the catalog first", () => {
    expect(publishBlocker(input({ editionId: null }))).toBe("Link this book to the catalog in Book Tracker first");
    expect(publishBlocker(input({ editionId: undefined }))).toBe("Link this book to the catalog in Book Tracker first");
    // A book created here has no tracker book to send for
    expect(publishBlocker(input({ trackerBookId: undefined }))).toBe("Link this book to the catalog in Book Tracker first");
  });

  test("needs the page count and current word counts", () => {
    expect(publishBlocker(input({ totalPages: undefined }))).toBe("Set the page count in Book Tracker first");
    expect(publishBlocker(input({ stalePages: 2 }))).toBe("Re-process 2 pages counted under an older rule");
  });

  test("waits for the pages drawn when the page count grew, even if the estimate is sendable", () => {
    expect(publishBlocker(input({ openGrowthSlots: 3 }))).toBe(
      "Photograph the 3 random pages drawn when the page count grew"
    );
    expect(buildWordEstimatePayload(input({ openGrowthSlots: 1 }))).toBeNull();
  });

  test("says how many random pages are missing", () => {
    const chosenOnly = computeBookEstimate(
      [300, 310, 290].map((wordCount) => ({ origin: "chosen" as const, ordinary: true, wordCount })),
      400
    )!;
    expect(chosenOnly.randomPagesForSendable).toBeGreaterThanOrEqual(MIN_RANDOM_PAGES);
    expect(publishBlocker(input({ estimate: chosenOnly, randomPages: 0 }))).toBe(
      `Add ${chosenOnly.randomPagesForSendable} random pages to send`
    );
    // Too few pages for any estimate yet
    expect(publishBlocker(input({ estimate: null, randomPages: 1 }))).toBe(`Add ${MIN_RANDOM_PAGES - 1} random pages to send`);
    const wide = computeBookEstimate([...random(true, 100, 500, 100, 500, 100, 500), ...random(false, 100, 500)], 400)!;
    expect(publishBlocker(input({ estimate: wide }))).toBe(`Add ${wide.randomPagesForSendable} random pages to send`);
  });
});

describe("buildWordEstimatePayload", () => {
  test("matches the catalog-setwordestimate contract", () => {
    expect(buildWordEstimatePayload(input())).toEqual({
      bookId: "tracker-1",
      editionId: "edition_1",
      method: "random-pages",
      countingVersion: 1,
      pageCountBasis: 400,
      chosenPages: 0,
      randomPages: 8,
      ordinaryShare: 0.75,
      wordsPerPage: SENDABLE.wordsPerPage,
      wordsPerPageLow: SENDABLE.wordsPerPageLow,
      wordsPerPageHigh: SENDABLE.wordsPerPageHigh,
      language: "en",
      readability: { fleschKincaidGrade: readability.fleschKincaidGrade, fleschReadingEase: readability.fleschReadingEase },
      vocabulary: null,
    });
  });

  test("is null while sending is blocked", () => {
    expect(buildWordEstimatePayload(input({ editionId: null }))).toBeNull();
  });

  test("sends readability only for English, and the vocabulary projection when there is one", () => {
    const vocabulary = { projection: { uniqueWords: 9000, low: 7000, high: 11000 } } as PublishInput["vocabulary"];
    const norwegian = buildWordEstimatePayload(input({ language: "no", vocabulary }))!;
    expect(norwegian.language).toBe("no");
    expect(norwegian.readability).toBeNull();
    expect(norwegian.vocabulary).toEqual({ uniqueWords: 9000, low: 7000, high: 11000 });
  });
});

test("samePayload ignores key order but not values", () => {
  const payload = buildWordEstimatePayload(input())!;
  const reordered = Object.fromEntries(Object.entries(payload).reverse()) as typeof payload;
  expect(samePayload(payload, reordered)).toBe(true);
  expect(samePayload(payload, { ...payload, wordsPerPage: payload.wordsPerPage + 1 })).toBe(false);
});
