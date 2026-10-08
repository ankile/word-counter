/**
 * Random page slots: printed page numbers drawn uniformly from the book, which the reader photographs to
 * correct the bias of hand-chosen pages (docs/book-tracker-word-estimates.md, W3).
 */

import type { PageOrigin } from "./validators";

interface SlotPage {
  origin: PageOrigin;
  bookPage?: number;
}

/** Draw up to `count` page numbers uniformly without replacement from 1..totalPages, skipping `taken`. */
export function drawPages(totalPages: number, taken: number[], count: number, random = Math.random): number[] {
  const skip = new Set(taken);
  const available = Array.from({ length: totalPages }, (_, i) => i + 1).filter((page) => !skip.has(page));
  const n = Math.min(count, available.length);
  // Partial Fisher–Yates shuffle
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (available.length - i));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, n);
}

/** Slots no random page has been photographed for yet, in draw order. */
export function openSlots(slots: number[], pages: SlotPage[]): number[] {
  const filled = new Set(pages.flatMap((p) => (p.origin === "random" ? [p.bookPage!] : [])));
  return slots.filter((slot) => !filled.has(slot));
}

/**
 * When the book's page count shrinks, slots past the new last page drop out, and their photos stay as
 * chosen pages (they were no longer drawn from the whole book).
 */
export function shrinkSlots<P extends SlotPage>(slots: number[], pages: P[], totalPages: number) {
  return {
    slots: slots.filter((slot) => slot <= totalPages),
    demote: pages.filter((p) => p.origin === "random" && p.bookPage! > totalPages),
  };
}
