import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  books: defineTable({
    title: v.string(),
    author: v.optional(v.string()),
    createdAt: v.number(),
    // Total pages in the book (from Firebase or manual entry)
    totalPages: v.optional(v.number()),
    // Firebase integration fields
    firebaseId: v.optional(v.string()),
    firebaseUserId: v.optional(v.string()),
  }).index("by_firebase_id", ["firebaseId"]),

  pages: defineTable({
    bookId: v.id("books"),
    imageStorageId: v.id("_storage"),
    pageNumber: v.number(),
    extractedText: v.optional(v.string()),
    wordCount: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("done"),
      v.literal("error")
    ),
    error: v.optional(v.string()),
    createdAt: v.number(),
    // OCR bounding boxes for visualization
    boundingBoxes: v.optional(
      v.array(
        v.object({
          text: v.string(),
          vertices: v.array(
            v.object({
              x: v.number(),
              y: v.number(),
            })
          ),
        })
      )
    ),
    // Readability metrics
    readability: v.optional(
      v.object({
        sentenceCount: v.number(),
        syllableCount: v.number(),
        avgWordsPerSentence: v.number(),
        avgSyllablesPerWord: v.number(),
        fleschReadingEase: v.number(),
        fleschKincaidGrade: v.number(),
        readingLevel: v.string(),
      })
    ),
  }).index("by_book", ["bookId"]),
});
