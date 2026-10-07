import { internalMutation } from "./_generated/server";
import { deletePage, pagesForBook } from "./pages";

// Firebase UIDs of the synthetic end-to-end test accounts (see e2e/testAccounts.ts)
export const E2E_USER_IDS = ["word-counter-e2e-a", "word-counter-e2e-b"];

/** Delete everything the e2e accounts own. Only ever touches the synthetic accounts. */
export const resetE2eAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    let deleted = 0;
    for (const ownerId of E2E_USER_IDS) {
      const books = await ctx.db
        .query("books")
        .withIndex("by_owner_and_tracker_book_id", (q) => q.eq("ownerId", ownerId))
        .collect();
      for (const book of books) {
        for (const page of await pagesForBook(ctx, book._id)) {
          await deletePage(ctx, page);
        }
        await ctx.db.delete("books", book._id);
        deleted++;
      }
    }
    return deleted;
  },
});
