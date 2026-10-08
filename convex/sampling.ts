/**
 * Random page slots: printed page numbers drawn uniformly from the book, which the reader photographs to
 * correct the bias of hand-chosen pages (docs/book-tracker-word-estimates.md, W3).
 */

import type { PageOrigin } from "./validators";

interface SlotPage {
  origin: PageOrigin;
  bookPage?: number;
}

// Most random pages to have open at once. The estimate, and so how many pages it still wants, changes with every
// page counted (a page awaiting OCR or the ordinary tick can briefly make it want hundreds), so slots are drawn in
// batches and refilled as they're photographed.
export const SLOT_BATCH = 10;

/** Slots to draw so the open ones cover what the estimate wants, up to a batch. */
export function slotShortfall(wanted: number, inFlight: number, open: number): number {
  return Math.max(0, Math.min(wanted - inFlight, SLOT_BATCH) - open);
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
 * When the book's page count grows, the slots so far came from 1..oldTotal only, so the new pages (often back matter:
 * notes, index, appendix) would be under-sampled. Draw extra slots from oldTotal+1..newTotal until they hold their
 * share of all slots, (newTotal − oldTotal) / newTotal, which makes the sample uniform over the whole book again.
 */
export function growSlots(slots: number[], oldTotal: number, newTotal: number, random = Math.random): number[] {
  const share = (newTotal - oldTotal) / newTotal;
  const inNewPages = slots.filter((slot) => slot > oldTotal);
  // (inNewPages + add) / (slots + add) = share
  const add = Math.round((share * slots.length - inNewPages.length) / (1 - share));
  if (add <= 0) return slots;
  const offsets = inNewPages.map((slot) => slot - oldTotal);
  return [...slots, ...drawPages(newTotal - oldTotal, offsets, add, random).map((offset) => offset + oldTotal)];
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
