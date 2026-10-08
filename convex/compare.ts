/**
 * The reader's measured books, side by side on difficulty (convex/difficulty.ts has the measures).
 */

import { query } from "./_generated/server";
import { requireUserId } from "./auth";
import { resolveLanguage } from "./books";
import { bookDifficulty } from "./difficulty";
import { pagesForBook } from "./pages";

/** The signed-in reader's books that can be compared, in the order they were added (so each keeps its colour). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const books = await ctx.db
      .query("books")
      .withIndex("by_owner_and_tracker_book_id", (q) => q.eq("ownerId", ownerId))
      .collect();
    const compared = [];
    for (const book of books.sort((a, b) => a._creationTime - b._creationTime)) {
      const pages = (await pagesForBook(ctx, book._id)).filter((p) => p.status === "done");
      const difficulty = bookDifficulty(
        pages.map((p) => ({ ...p, wordCount: p.wordCount!, extractedText: p.extractedText! })),
        book.totalPages,
        resolveLanguage(book, pages)
      );
      if (difficulty) compared.push({ _id: book._id, title: book.title, author: book.author ?? null, ...difficulty });
    }
    return compared;
  },
});
