import { v } from "convex/values";
import { BOOK_TRACKER_USER_ID } from "./bookTracker";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { deletePage, pagesForBook } from "./pages";
import { averageReadability, computeSamplingStats } from "./stats";

function summarizePages(pages: Doc<"pages">[]) {
  const processed = pages.filter((p) => p.status === "done");
  const totalWordCount = processed.reduce((sum, p) => sum + p.wordCount!, 0);
  return {
    pageCount: pages.length,
    processedCount: processed.length,
    totalWordCount,
    avgWordsPerPage: processed.length > 0 ? Math.round(totalWordCount / processed.length) : null,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const books = await ctx.db.query("books").order("desc").collect();
    return await Promise.all(
      books.map(async (book) => ({
        ...book,
        ...summarizePages(await pagesForBook(ctx, book._id)),
      }))
    );
  },
});

export const get = query({
  args: { id: v.id("books") },
  handler: async (ctx, args) => {
    const book = await ctx.db.get("books", args.id);
    if (!book) return null;

    const pages = await pagesForBook(ctx, args.id);
    const processed = pages.filter((p) => p.status === "done");

    return {
      ...book,
      ...summarizePages(pages),
      avgReadability: averageReadability(processed.flatMap((p) => (p.readability ? [p.readability] : []))),
      samplingStats: computeSamplingStats(processed.map((p) => p.wordCount!)),
    };
  },
});

export const create = mutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("books", {
      title: args.title,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("books") },
  handler: async (ctx, args) => {
    for (const page of await pagesForBook(ctx, args.id)) {
      await deletePage(ctx, page);
    }
    await ctx.db.delete("books", args.id);
  },
});

export const importFromFirebase = mutation({
  args: {
    firebaseId: v.string(),
    title: v.string(),
    author: v.optional(v.string()),
    totalPages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("books")
      .withIndex("by_firebase_id", (q) => q.eq("firebaseId", args.firebaseId))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("books", {
      ...args,
      createdAt: Date.now(),
      firebaseUserId: BOOK_TRACKER_USER_ID,
    });
  },
});
