import { describe, expect, test } from "vitest";
import { drawPages, openSlots, shrinkSlots } from "./sampling";

describe("drawPages", () => {
  test("draws distinct pages in 1..totalPages, skipping taken ones", () => {
    const drawn = drawPages(50, [1, 2, 3], 20);
    expect(new Set(drawn).size).toBe(20);
    for (const page of drawn) {
      expect(page).toBeGreaterThanOrEqual(4);
      expect(page).toBeLessThanOrEqual(50);
    }
  });

  test("stops when the book runs out of pages", () => {
    expect(drawPages(5, [2, 4], 10).sort()).toEqual([1, 3, 5]);
  });

  test("is uniform over the remaining pages", () => {
    const hits = new Array(11).fill(0);
    for (let i = 0; i < 20_000; i++) for (const page of drawPages(10, [], 3)) hits[page]++;
    // Each of the 10 pages is drawn 3/10 of the time: 6000 ± ~4 sd (≈ 65 each)
    for (let page = 1; page <= 10; page++) expect(Math.abs(hits[page] - 6000)).toBeLessThan(300);
  });
});

test("a slot stays open until a random page carries its page number", () => {
  const pages = [
    { origin: "random" as const, bookPage: 214 },
    // A chosen page on a slot's page number doesn't fill it
    { origin: "chosen" as const, bookPage: 37 },
  ];
  expect(openSlots([214, 37, 120], pages)).toEqual([37, 120]);
});

test("slots past a shrunken totalPages drop out and their photos become chosen", () => {
  const pages = [
    { id: "a", origin: "random" as const, bookPage: 150 },
    { id: "b", origin: "random" as const, bookPage: 310 },
    { id: "c", origin: "chosen" as const, bookPage: 305 },
  ];
  const { slots, demote } = shrinkSlots([150, 310, 290, 12], pages, 300);
  expect(slots).toEqual([150, 290, 12]);
  expect(demote.map((p) => p.id)).toEqual(["b"]);
});
