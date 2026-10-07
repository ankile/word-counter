import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { boundingBox, pageStatus, readability } from "./validators";

export default defineSchema({
  books: defineTable({
    // Firebase Auth UID of the Book Tracker user who owns this book
    ownerId: v.string(),
    title: v.string(),
    author: v.optional(v.string()),
    createdAt: v.number(),
    // Total pages in the book, from Book Tracker
    totalPages: v.optional(v.number()),
    // Book Tracker document ID (users/{ownerId}/books/{trackerBookId}); absent for books created here
    trackerBookId: v.optional(v.string()),
    finished: v.optional(v.boolean()),
    // Tracker last-read time, or when it was added if never read; orders the library
    activityAt: v.optional(v.number()),
  }).index("by_owner_and_tracker_book_id", ["ownerId", "trackerBookId"]),

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
