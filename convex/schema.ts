import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { boundingBox, pageOrigin, pageStatus, readability, wordEstimatePayload } from "./validators";

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
    // Book Tracker catalog links (null when the tracker book isn't linked); read-only mirrors
    editionId: v.optional(v.union(v.string(), v.null())),
    workId: v.optional(v.union(v.string(), v.null())),
    // ISO 639 code from Book Tracker, '' when unknown
    language: v.optional(v.string()),
    // Printed page numbers drawn uniformly from 1..totalPages, in draw order. A slot is open until a
    // random page with that bookPage exists.
    randomSlots: v.optional(v.array(v.number())),
    // The last estimate sent to Book Tracker
    published: v.optional(v.object({ publishedAt: v.number(), measuredAt: v.string(), payload: wordEstimatePayload })),
  }).index("by_owner_and_tracker_book_id", ["ownerId", "trackerBookId"]),

  pages: defineTable({
    bookId: v.id("books"),
    imageStorageId: v.id("_storage"),
    // Upload order within the book, not the printed page number
    pageNumber: v.number(),
    // Transitional: optional until migrations:backfillPageSampling has run
    origin: v.optional(pageOrigin),
    // Printed page number; always set for random pages
    bookPage: v.optional(v.number()),
    // A full page of running text (no chapter start or end, illustration, table or blank space)
    ordinary: v.optional(v.boolean()),
    extractedText: v.optional(v.string()),
    wordCount: v.optional(v.number()),
    // COUNTING_VERSION of the rule that produced wordCount
    countingVersion: v.optional(v.number()),
    // Language Vision detected on the page (ISO 639)
    language: v.optional(v.string()),
    status: pageStatus,
    error: v.optional(v.string()),
    createdAt: v.number(),
    // OCR bounding boxes for visualization
    boundingBoxes: v.optional(v.array(boundingBox)),
    // English pages only
    readability: v.optional(readability),
  }).index("by_book_and_page_number", ["bookId", "pageNumber"]),
});
