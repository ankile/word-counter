import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireOwnedBook, requireOwnedPage, requireUserId } from "./auth";
import { openSlots } from "./sampling";

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

export async function queueOcr(ctx: MutationCtx, book: Doc<"books">, page: Pick<Doc<"pages">, "_id" | "imageStorageId">) {
  await ctx.scheduler.runAfter(0, internal.ocrAction.processPage, {
    pageId: page._id,
    imageStorageId: page.imageStorageId,
    runningHeaders: runningHeaders(book),
    bookLanguage: book.language ?? "",
  });
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

/**
 * Create pages for uploaded images (numbered after the book's last page) and queue OCR. With `slots`, image i
 * fills the open random slot slots[i]; otherwise the pages are hand-chosen.
 */
export const createMany = mutation({
  args: {
    bookId: v.id("books"),
    imageStorageIds: v.array(v.id("_storage")),
    slots: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const book = await requireOwnedBook(ctx, args.bookId);
    const pages = await pagesForBook(ctx, args.bookId);
    if (args.slots) {
      const open = new Set(openSlots(book.randomSlots ?? [], pages));
      if (args.slots.length !== args.imageStorageIds.length || args.slots.some((slot) => !open.delete(slot))) {
        throw new Error("Not an open random page");
      }
    }
    const firstPageNumber = (pages.at(-1)?.pageNumber ?? 0) + 1;

    for (const [i, imageStorageId] of args.imageStorageIds.entries()) {
      const pageId = await ctx.db.insert("pages", {
        bookId: args.bookId,
        imageStorageId,
        pageNumber: firstPageNumber + i,
        origin: args.slots ? "random" : "chosen",
        bookPage: args.slots?.[i],
        ordinary: true,
        status: "pending",
        createdAt: Date.now(),
      });
      await queueOcr(ctx, book, { _id: pageId, imageStorageId });
    }
  },
});

export const reprocess = mutation({
  args: { id: v.id("pages") },
  handler: async (ctx, args) => {
    const page = await requireOwnedPage(ctx, args.id);
    const book = await requireOwnedBook(ctx, page.bookId);
    await ctx.db.patch("pages", args.id, { status: "pending" });
    await queueOcr(ctx, book, page);
  },
});

/** Mark whether a page is an ordinary page of running text. */
export const setOrdinary = mutation({
  args: { id: v.id("pages"), ordinary: v.boolean() },
  handler: async (ctx, args) => {
    await requireOwnedPage(ctx, args.id);
    await ctx.db.patch("pages", args.id, { ordinary: args.ordinary });
  },
});

/** Record (or clear) the printed page number of a hand-chosen page. A random page's number is its slot. */
export const setBookPage = mutation({
  args: { id: v.id("pages"), bookPage: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const page = await requireOwnedPage(ctx, args.id);
    if (page.origin === "random") throw new Error("A random page's number is fixed by its slot");
    await ctx.db.patch("pages", args.id, { bookPage: args.bookPage });
  },
});

export const remove = mutation({
  args: { id: v.id("pages") },
  handler: async (ctx, args) => {
    await deletePage(ctx, await requireOwnedPage(ctx, args.id));
  },
});
