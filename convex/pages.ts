import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listByBook = query({
  args: { bookId: v.id("books") },
  handler: async (ctx, args) => {
    const pages = await ctx.db
      .query("pages")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();

    const pagesWithUrls = await Promise.all(
      pages.map(async (page) => {
        const imageUrl = await ctx.storage.getUrl(page.imageStorageId);
        return { ...page, imageUrl };
      })
    );

    return pagesWithUrls.sort((a, b) => a.pageNumber - b.pageNumber);
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    bookId: v.id("books"),
    imageStorageId: v.id("_storage"),
    pageNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const pageId = await ctx.db.insert("pages", {
      bookId: args.bookId,
      imageStorageId: args.imageStorageId,
      pageNumber: args.pageNumber,
      status: "pending",
      createdAt: Date.now(),
    });
    return pageId;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("pages"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("done"),
      v.literal("error")
    ),
    extractedText: v.optional(v.string()),
    wordCount: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("pages") },
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.id);
    if (page) {
      await ctx.storage.delete(page.imageStorageId);
      await ctx.db.delete(args.id);
    }
  },
});
