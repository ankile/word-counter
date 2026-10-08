import { describe, expect, test } from "vitest";
import { drawPages, growSlots, openSlots, shrinkSlots, SLOT_BATCH, slotShortfall } from "./sampling";

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

test("open slots cover what the estimate wants, a batch at a time", () => {
  // Nothing drawn yet: the minimum sample
  expect(slotShortfall(8, 0, 0)).toBe(8);
  // A large need opens one batch, refilled as slots are photographed
  expect(slotShortfall(173, 0, 4)).toBe(SLOT_BATCH - 4);
  expect(slotShortfall(173, 0, SLOT_BATCH)).toBe(0);
  // Pages awaiting OCR already fill slots; open slots beyond the need stay
  expect(slotShortfall(6, 2, 3)).toBe(1);
  expect(slotShortfall(2, 0, 5)).toBe(0);
});

test("a slot stays open until a random page carries its page number", () => {
  const pages = [
    { origin: "random" as const, bookPage: 214 },
    // A chosen page on a slot's page number doesn't fill it
    { origin: "chosen" as const, bookPage: 37 },
  ];
  expect(openSlots([214, 37, 120], pages)).toEqual([37, 120]);
});

describe("growSlots", () => {
  const slots = [10, 20, 30, 40, 50, 60, 70, 80];

  test("draws from the new pages until they hold their share of the slots", () => {
    // 100 → 200 pages: the new half needs half the slots
    const grown = growSlots(slots, 100, 200);
    expect(grown.slice(0, 8)).toEqual(slots);
    const added = grown.slice(8);
    expect(added).toHaveLength(8);
    expect(new Set(added).size).toBe(8);
    for (const page of added) {
      expect(page).toBeGreaterThan(100);
      expect(page).toBeLessThanOrEqual(200);
    }
    // 100 → 110: one in eleven slots, so one more
    expect(growSlots(slots, 100, 110).slice(8)).toHaveLength(1);
  });

  test("leaves slots alone when the new pages already have their share, or there are none", () => {
    expect(growSlots([...slots, 150, 160, 170, 180, 190, 101, 102, 103], 100, 200)).toHaveLength(16);
    expect(growSlots([], 100, 200)).toEqual([]);
  });
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
