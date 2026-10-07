import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/** Firebase UID of the signed-in Book Tracker user. */
export async function requireUserId(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not signed in");
  return identity.subject;
}

/** The book, if it belongs to the signed-in user. */
export async function requireOwnedBook(ctx: QueryCtx, bookId: Id<"books">) {
  const userId = await requireUserId(ctx);
  const book = await ctx.db.get("books", bookId);
  if (!book || book.ownerId !== userId) throw new Error("Book not found");
  return book;
}

/** The page, if its book belongs to the signed-in user. */
export async function requireOwnedPage(ctx: QueryCtx, pageId: Id<"pages">) {
  const page = await ctx.db.get("pages", pageId);
  if (!page) throw new Error("Page not found");
  await requireOwnedBook(ctx, page.bookId);
  return page;
}
