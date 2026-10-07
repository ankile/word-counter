import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireOwnedBook, requireOwnedPage, requireUserId } from "./auth";

/** All pages of a book, ordered by page number. */
export async function pagesForBook(ctx: QueryCtx, bookId: Id<"books">) {
  return await ctx.db
    .query("pages")
    .withIndex("by_book_and_page_number", (q) => q.eq("bookId", bookId))
    .collect();
}

/** Header lines a page of this book may carry (title on one side, author on the other). */
export function runningHeaders(book: Doc<"books">): string[] {
  return [book.title, ...(book.author?.split(", ") ?? [])];
}

export async function deletePage(ctx: MutationCtx, page: Doc<"pages">) {
  await ctx.storage.delete(page.imageStorageId);
  await ctx.db.delete("pages", page._id);
}

export const listByBook = query({
  args: { bookId: v.id("books") },
  handler: async (ctx, args) => {
    await requireOwnedBook(ctx, args.bookId);
    const pages = await pagesForBook(ctx, args.bookId);
    return await Promise.all(
      pages.map(async (page) => ({ ...page, imageUrl: await ctx.storage.getUrl(page.imageStorageId) }))
    );
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Create pages for uploaded images (numbered after the book's last page) and queue OCR. */
export const createMany = mutation({
  args: {
    bookId: v.id("books"),
    imageStorageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const book = await requireOwnedBook(ctx, args.bookId);
    const lastPage = await ctx.db
      .query("pages")
      .withIndex("by_book_and_page_number", (q) => q.eq("bookId", args.bookId))
      .order("desc")
      .first();
    const firstPageNumber = (lastPage?.pageNumber ?? 0) + 1;

    for (const [i, imageStorageId] of args.imageStorageIds.entries()) {
      const pageId = await ctx.db.insert("pages", {
        bookId: args.bookId,
        imageStorageId,
        pageNumber: firstPageNumber + i,
        origin: "chosen",
        ordinary: true,
        status: "pending",
        createdAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.ocrAction.processPage, {
        pageId,
        imageStorageId,
        runningHeaders: runningHeaders(book),
      });
    }
  },
});

export const reprocess = mutation({
  args: { id: v.id("pages") },
  handler: async (ctx, args) => {
    const page = await requireOwnedPage(ctx, args.id);
    const book = await requireOwnedBook(ctx, page.bookId);
    await ctx.db.patch("pages", args.id, { status: "pending" });
    await ctx.scheduler.runAfter(0, internal.ocrAction.processPage, {
      pageId: args.id,
      imageStorageId: page.imageStorageId,
      runningHeaders: runningHeaders(book),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("pages") },
  handler: async (ctx, args) => {
    await deletePage(ctx, await requireOwnedPage(ctx, args.id));
  },
});
