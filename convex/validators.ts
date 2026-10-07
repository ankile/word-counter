import { v, type Infer } from "convex/values";

export const pageStatus = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("done"),
  v.literal("error")
);

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

export type PageStatus = Infer<typeof pageStatus>;
export type BoundingBox = Infer<typeof boundingBox>;
export type Readability = Infer<typeof readability>;
