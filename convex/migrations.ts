/**
 * Data migrations, run by hand: npx convex run [--prod] migrations:<name>
 */

import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { queueOcr } from "./pages";
import { COUNTING_VERSION } from "./textAnalysis";

/**
 * Fields a page from before random sampling gets: every one of them was picked by hand, and counts as an ordinary
 * page until the owner unticks it. Pages already counted were counted under version 1 of the counting rule.
 */
export function backfilledPageFields(page: Doc<"pages">): Partial<Doc<"pages">> {
  return {
    ...(page.origin === undefined && { origin: "chosen" as const }),
    ...(page.ordinary === undefined && { ordinary: true }),
    ...(page.status === "done" && page.countingVersion === undefined && { countingVersion: 1 }),
  };
}

/** Give pages created before origin/ordinary existed their values. Idempotent. */
export const backfillPageSampling = internalMutation({
  args: {},
  handler: async (ctx) => {
    let patched = 0;
    for (const page of await ctx.db.query("pages").collect()) {
      const fields = backfilledPageFields(page);
      if (Object.keys(fields).length > 0) {
        await ctx.db.patch("pages", page._id, fields);
        patched++;
      }
    }
    return patched;
  },
});

/** Re-run OCR on every page counted under an older COUNTING_VERSION (after the counting rule changes). */
export const reprocessStalePages = internalMutation({
  args: {},
  handler: async (ctx) => {
    let queued = 0;
    for (const page of await ctx.db.query("pages").collect()) {
      if (page.status === "done" && page.countingVersion !== COUNTING_VERSION) {
        await ctx.db.patch("pages", page._id, { status: "pending" });
        await queueOcr(ctx, (await ctx.db.get("books", page.bookId))!, page);
        queued++;
      }
    }
    return queued;
  },
});
