import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  books: defineTable({
    title: v.string(),
    createdAt: v.number(),
  }),

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
  }).index("by_book", ["bookId"]),
});
