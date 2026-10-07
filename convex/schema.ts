import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { boundingBox, pageStatus, readability } from "./validators";

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
    status: pageStatus,
    error: v.optional(v.string()),
    createdAt: v.number(),
    // OCR bounding boxes for visualization
    boundingBoxes: v.optional(v.array(boundingBox)),
    readability: v.optional(readability),
  }).index("by_book_and_page_number", ["bookId", "pageNumber"]),
});
