import { v, type Infer } from "convex/values";

export const pageStatus = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("done"),
  v.literal("error")
);

// How a page came to be sampled: picked by hand, or drawn uniformly from the book's pages
export const pageOrigin = v.union(v.literal("chosen"), v.literal("random"));

// OCR word bounding box, in original image pixel coordinates
export const boundingBox = v.object({
  text: v.string(),
  vertices: v.array(v.object({ x: v.number(), y: v.number() })),
});

export const readability = v.object({
  sentenceCount: v.number(),
  syllableCount: v.number(),
  avgWordsPerSentence: v.number(),
  avgSyllablesPerWord: v.number(),
  fleschReadingEase: v.number(),
  fleschKincaidGrade: v.number(),
  readingLevel: v.string(),
});

// Request of Book Tracker's catalog-setwordestimate callable (docs/book-tracker-word-estimates.md)
export const wordEstimatePayload = v.object({
  bookId: v.string(),
  editionId: v.string(),
  method: v.union(v.literal("random-pages"), v.literal("corrected-chosen")),
  countingVersion: v.number(),
  pageCountBasis: v.number(),
  chosenPages: v.number(),
  randomPages: v.number(),
  ordinaryShare: v.number(),
  wordsPerPage: v.number(),
  wordsPerPageLow: v.number(),
  wordsPerPageHigh: v.number(),
  language: v.string(),
  readability: v.union(v.object({ fleschKincaidGrade: v.number(), fleschReadingEase: v.number() }), v.null()),
  vocabulary: v.union(v.object({ uniqueWords: v.number(), low: v.number(), high: v.number() }), v.null()),
});

export type PageStatus = Infer<typeof pageStatus>;
export type PageOrigin = Infer<typeof pageOrigin>;
export type BoundingBox = Infer<typeof boundingBox>;
export type Readability = Infer<typeof readability>;
export type WordEstimatePayload = Infer<typeof wordEstimatePayload>;
