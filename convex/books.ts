import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireOwnedBook, requireUserId } from "./auth";
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

/** The signed-in user's books, most recently read first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const books = await ctx.db
      .query("books")
      .withIndex("by_owner_and_tracker_book_id", (q) => q.eq("ownerId", ownerId))
      .collect();
    const withStats = await Promise.all(
      books.map(async (book) => ({ ...book, ...summarizePages(await pagesForBook(ctx, book._id)) }))
    );
    return withStats.sort((a, b) => (b.activityAt ?? b.createdAt) - (a.activityAt ?? a.createdAt));
  },
});

export const get = query({
  args: { id: v.id("books") },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const book = await ctx.db.get("books", args.id);
    // Someone else's book is indistinguishable from a missing one
    if (!book || book.ownerId !== ownerId) return null;

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

/** Delete a book created here (tracker books come back on the next sync, so they can't be deleted). */
export const remove = mutation({
  args: { id: v.id("books") },
  handler: async (ctx, args) => {
    const book = await requireOwnedBook(ctx, args.id);
    if (book.trackerBookId) throw new Error("Book Tracker books can't be deleted here");
    for (const page of await pagesForBook(ctx, args.id)) {
      await deletePage(ctx, page);
    }
    await ctx.db.delete("books", args.id);
  },
});

const trackerBook = v.object({
  trackerBookId: v.string(),
  title: v.string(),
  author: v.optional(v.string()),
  totalPages: v.optional(v.number()),
  finished: v.boolean(),
  activityAt: v.number(),
});

const normalizeTitle = (title: string) => title.trim().toLowerCase();

/**
 * Mirror the user's Book Tracker library (read in the browser under the tracker's security rules).
 * Books removed from the tracker are dropped unless they already have sampled pages.
 */
export const syncFromTracker = mutation({
  args: { books: v.array(trackerBook) },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("books")
      .withIndex("by_owner_and_tracker_book_id", (q) => q.eq("ownerId", ownerId))
      .collect();
    const byTrackerId = new Map(existing.flatMap((b) => (b.trackerBookId ? [[b.trackerBookId, b]] : [])));
    // Books created here before syncing existed; link them to the tracker book with the same title
    const unlinkedByTitle = new Map(
      existing.flatMap((b) => (b.trackerBookId ? [] : [[normalizeTitle(b.title), b]]))
    );

    for (const { trackerBookId, ...fields } of args.books) {
      const current = byTrackerId.get(trackerBookId) ?? unlinkedByTitle.get(normalizeTitle(fields.title));
      byTrackerId.delete(trackerBookId);
      if (!current) {
        await ctx.db.insert("books", { ownerId, trackerBookId, ...fields, createdAt: Date.now() });
        continue;
      }
      unlinkedByTitle.delete(normalizeTitle(current.title));
      const changed =
        current.trackerBookId !== trackerBookId ||
        (Object.keys(fields) as (keyof typeof fields)[]).some((key) => current[key] !== fields[key]);
      if (changed) {
        await ctx.db.patch("books", current._id, { trackerBookId, ...fields });
      }
    }

    for (const removed of byTrackerId.values()) {
      if ((await pagesForBook(ctx, removed._id)).length === 0) {
        await ctx.db.delete("books", removed._id);
      }
    }
  },
});
