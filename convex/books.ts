import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const books = await ctx.db.query("books").order("desc").collect();

    const booksWithCounts = await Promise.all(
      books.map(async (book) => {
        const pages = await ctx.db
          .query("pages")
          .withIndex("by_book", (q) => q.eq("bookId", book._id))
          .collect();

        const totalWordCount = pages.reduce(
          (sum, page) => sum + (page.wordCount ?? 0),
          0
        );
        const pageCount = pages.length;
        const processedCount = pages.filter((p) => p.status === "done").length;

        return {
          ...book,
          totalWordCount,
          pageCount,
          processedCount,
        };
      })
    );

    return booksWithCounts;
  },
});

export const get = query({
  args: { id: v.id("books") },
  handler: async (ctx, args) => {
    const book = await ctx.db.get(args.id);
    if (!book) return null;

    const pages = await ctx.db
      .query("pages")
      .withIndex("by_book", (q) => q.eq("bookId", args.id))
      .collect();

    const totalWordCount = pages.reduce(
      (sum, page) => sum + (page.wordCount ?? 0),
      0
    );

    return {
      ...book,
      totalWordCount,
      pageCount: pages.length,
    };
  },
});

export const create = mutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const bookId = await ctx.db.insert("books", {
      title: args.title,
      createdAt: Date.now(),
    });
    return bookId;
  },
});

export const remove = mutation({
  args: { id: v.id("books") },
  handler: async (ctx, args) => {
    const pages = await ctx.db
      .query("pages")
      .withIndex("by_book", (q) => q.eq("bookId", args.id))
      .collect();

    for (const page of pages) {
      await ctx.storage.delete(page.imageStorageId);
      await ctx.db.delete(page._id);
    }

    await ctx.db.delete(args.id);
  },
});
