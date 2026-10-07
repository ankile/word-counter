import { describe, expect, test } from "vitest";
import { analyzeText, cleanOcrText, countWords, getReadingLevel } from "./textAnalysis";

describe("cleanOcrText", () => {
  test("drops page numbers and short all-caps headers, rejoins hyphenated line breaks", () => {
    const raw = "300 VIRAL BA\nThe company was well-\nfunded and grew.\n42";
    expect(cleanOcrText(raw)).toBe("The company was well-funded and grew.");
  });

  test("drops running headers matching the book's title or author, with or without a page number", () => {
    const raw = "Patrick Rothfuss\nfor a long moment.\n\nThe Wise Man\u2019s Fear 45\nHe sang.\n12 Patrick Rothfuss";
    expect(cleanOcrText(raw, ["The Wise Man's Fear", "Patrick Rothfuss"])).toBe("for a long moment.\n\nHe sang.");
    // Lines that merely mention the title stay
    expect(cleanOcrText("He read The Wise Man's Fear twice.", ["The Wise Man's Fear"])).toBe(
      "He read The Wise Man's Fear twice."
    );
  });

  test("keeps long all-caps lines and mixed-case short lines", () => {
    const longCaps = "THIS IS A LONG SHOUTED SENTENCE IN THE BODY TEXT";
    expect(cleanOcrText(`${longCaps}\nShort line`)).toBe(`${longCaps}\nShort line`);
  });
});

test("countWords counts whitespace-separated tokens", () => {
  expect(countWords("  one two\n\nthree — 4 ")).toBe(5);
  expect(countWords("")).toBe(0);
});

describe("analyzeText", () => {
  test("simple text is easy to read", () => {
    const r = analyzeText("The cat sat on the mat. The dog ran.");
    expect(r.sentenceCount).toBe(2);
    expect(r.avgWordsPerSentence).toBe(4.5);
    expect(r.fleschReadingEase).toBeGreaterThan(90);
    expect(r.readingLevel).toBe("Very Easy (5th grade)");
  });

  test("empty text yields zeros with a single sentence", () => {
    const r = analyzeText("");
    expect(r).toMatchObject({ sentenceCount: 1, syllableCount: 0, fleschReadingEase: 0, fleschKincaidGrade: 0 });
  });
});

test("getReadingLevel thresholds", () => {
  expect(getReadingLevel(95)).toBe("Very Easy (5th grade)");
  expect(getReadingLevel(60)).toBe("Standard (8th-9th grade)");
  expect(getReadingLevel(10)).toBe("Very Difficult (College graduate)");
});
