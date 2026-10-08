/**
 * Sending a book's estimate to Book Tracker's catalog-setwordestimate callable (docs/book-tracker-word-estimates.md, W7).
 */

import { MIN_RANDOM_PAGES, type averageReadability, type BookEstimate } from "./stats";
import type { WordEstimatePayload } from "./validators";
import type { VocabularyStats } from "./vocabulary";

export interface PublishInput {
  trackerBookId: string | undefined;
  editionId: string | null | undefined;
  totalPages: number | undefined;
  estimate: BookEstimate | null;
  // Random pages already OCR'd; what the estimate counts when there is one
  randomPages: number;
  // Done pages counted under an older COUNTING_VERSION
  stalePages: number;
  // Open slots drawn from the new pages after the page count grew
  openGrowthSlots: number;
  language: string;
  readability: ReturnType<typeof averageReadability>;
  vocabulary: VocabularyStats | null;
}

/** Why the estimate can't be sent yet, or null when it can. */
export function publishBlocker(input: PublishInput): string | null {
  if (!input.trackerBookId || !input.editionId) return "Link this book to the catalog in Book Tracker first";
  if (input.totalPages === undefined) return "Set the page count in Book Tracker first";
  if (input.stalePages > 0) {
    return `Re-process ${input.stalePages} ${input.stalePages === 1 ? "page" : "pages"} counted under an older rule`;
  }
  // The estimate rests on the old pages only until the pages the book gained are sampled
  if (input.openGrowthSlots > 0) {
    const n = input.openGrowthSlots;
    return `Photograph the ${n} random ${n === 1 ? "page" : "pages"} drawn when the page count grew`;
  }
  if (input.estimate?.sendable) return null;
  const needed = input.estimate?.randomPagesForSendable ?? Math.max(1, MIN_RANDOM_PAGES - input.randomPages);
  return `Add ${needed} random ${needed === 1 ? "page" : "pages"} to send`;
}

/** The callable's request, or null while publishBlocker gives a reason. */
export function buildWordEstimatePayload(input: PublishInput): WordEstimatePayload | null {
  if (publishBlocker(input) !== null) return null;
  const estimate = input.estimate!;
  return {
    bookId: input.trackerBookId!,
    editionId: input.editionId!,
    method: estimate.method as WordEstimatePayload["method"],
    countingVersion: estimate.countingVersion,
    pageCountBasis: estimate.pageCountBasis!,
    chosenPages: estimate.chosenPages,
    randomPages: estimate.randomPages,
    ordinaryShare: estimate.ordinaryShare!,
    wordsPerPage: estimate.wordsPerPage,
    wordsPerPageLow: estimate.wordsPerPageLow,
    wordsPerPageHigh: estimate.wordsPerPageHigh,
    language: input.language,
    // Flesch scores are English-only
    readability:
      input.language === "en" && input.readability
        ? {
            fleschKincaidGrade: input.readability.fleschKincaidGrade,
            fleschReadingEase: input.readability.fleschReadingEase,
          }
        : null,
    vocabulary: input.vocabulary?.projection
      ? {
          uniqueWords: input.vocabulary.projection.uniqueWords,
          low: input.vocabulary.projection.low,
          high: input.vocabulary.projection.high,
        }
      : null,
  };
}

const canonical = (value: unknown): unknown =>
  value !== null && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, inner]) => [key, canonical(inner)])
      )
    : value;

/** Whether two payloads carry the same estimate (key order aside). */
export const samePayload = (a: WordEstimatePayload, b: WordEstimatePayload) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
