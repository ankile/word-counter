import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireOwnedBook, requireUserId } from "./auth";
import { deletePage, pagesForBook } from "./pages";
import { buildWordEstimatePayload, publishBlocker, samePayload } from "./publish";
import { drawPages, growSlots, openSlots, shrinkSlots, slotShortfall } from "./sampling";
import { averageReadability, computeBookEstimate, MIN_RANDOM_PAGES } from "./stats";
import { COUNTING_VERSION } from "./textAnalysis";
import { wordEstimatePayload } from "./validators";
import { computeVocabularyStats } from "./vocabulary";

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

/** The book's language: Book Tracker's if set, otherwise the one Vision detected on most pages ('' if none). */
function resolveLanguage(book: Doc<"books">, processed: Doc<"pages">[]): string {
  if (book.language) return book.language;
  const votes = new Map<string, number>();
  for (const { language } of processed) if (language) votes.set(language, (votes.get(language) ?? 0) + 1);
  return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

/** The estimate and the random pages it still wants. */
async function sampleState(ctx: QueryCtx, book: Doc<"books">) {
  const pages = await pagesForBook(ctx, book._id);
  const processed = pages.filter((p) => p.status === "done");
  const estimate = computeBookEstimate(
    processed.map((p) => ({ origin: p.origin, ordinary: p.ordinary, wordCount: p.wordCount! })),
    book.totalPages
  );
  const randomDone = processed.filter((p) => p.origin === "random").length;
  const open = openSlots(book.randomSlots ?? [], pages);
  // Random pages photographed but not yet counted (or that failed OCR) already fill a slot
  const randomInFlight = pages.filter((p) => p.origin === "random" && p.status !== "done").length;
  const wanted = estimate?.randomPagesForRecommended ?? Math.max(0, MIN_RANDOM_PAGES - randomDone);
  return {
    pages,
    processed,
    estimate,
    randomDone,
    openSlots: open,
    // Slots to draw so that the open ones cover what ±10% needs, a batch at a time
    slotShortfall: book.totalPages === undefined ? 0 : slotShortfall(wanted, randomInFlight, open.length),
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

    const { pages, processed, estimate, randomDone, openSlots, slotShortfall } = await sampleState(ctx, book);
    const language = resolveLanguage(book, processed);
    // Flesch scores are English-only
    const readability =
      language === "en" ? averageReadability(processed.flatMap((p) => (p.readability ? [p.readability] : []))) : null;
    // Extrapolated to the estimated word count, so it matches wordsPerPage × pageCount
    const vocabulary = computeVocabularyStats(
      processed.map((p) => p.extractedText!),
      book.totalPages,
      estimate?.totalWords ?? undefined
    );

    const publishInput = {
      trackerBookId: book.trackerBookId,
      editionId: book.editionId,
      totalPages: book.totalPages,
      estimate,
      randomPages: randomDone,
      stalePages: processed.filter((p) => p.countingVersion !== COUNTING_VERSION).length,
      language,
      readability,
      vocabulary,
    };
    const payload = buildWordEstimatePayload(publishInput);

    return {
      ...book,
      ...summarizePages(pages),
      resolvedLanguage: language,
      avgReadability: readability,
      estimate,
      openSlots,
      slotShortfall,
      vocabulary,
      publish: {
        blocker: publishBlocker(publishInput),
        payload,
        // Sent, and whether the current estimate still matches what was sent
        sent: book.published
          ? { publishedAt: book.published.publishedAt, current: payload !== null && samePayload(payload, book.published.payload) }
          : null,
      },
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

/** Draw random pages until the open slots cover what the ±10% target needs, a batch at a time. No-op when they do. */
export const topUpRandomSlots = mutation({
  args: { id: v.id("books") },
  handler: async (ctx, args) => {
    const book = await requireOwnedBook(ctx, args.id);
    const { slotShortfall } = await sampleState(ctx, book);
    if (slotShortfall === 0) return;
    const slots = book.randomSlots ?? [];
    await ctx.db.patch("books", book._id, {
      randomSlots: [...slots, ...drawPages(book.totalPages!, slots, slotShortfall)],
    });
  },
});

/** "Suggest more": draw extra random pages beyond what the estimate asks for. */
export const drawRandomSlots = mutation({
  args: { id: v.id("books"), count: v.number() },
  handler: async (ctx, args) => {
    const book = await requireOwnedBook(ctx, args.id);
    const slots = book.randomSlots ?? [];
    await ctx.db.patch("books", book._id, {
      randomSlots: [...slots, ...drawPages(book.totalPages!, slots, args.count)],
    });
  },
});

/**
 * Swap an open slot for a fresh draw, for a page that can't be photographed at all (missing, torn). Blank pages
 * and pages without body text must be photographed instead: their low counts are what the random pages correct for.
 */
export const replaceRandomSlot = mutation({
  args: { id: v.id("books"), bookPage: v.number() },
  handler: async (ctx, args) => {
    const book = await requireOwnedBook(ctx, args.id);
    const slots = book.randomSlots ?? [];
    if (!openSlots(slots, await pagesForBook(ctx, book._id)).includes(args.bookPage)) {
      throw new Error("Not an open random page");
    }
    // The replaced page stays excluded from this draw
    const [fresh] = drawPages(book.totalPages!, slots, 1);
    await ctx.db.patch("books", book._id, {
      randomSlots: slots.flatMap((slot) => (slot !== args.bookPage ? [slot] : fresh === undefined ? [] : [fresh])),
    });
  },
});

/** Record an estimate Book Tracker stored (catalog-setwordestimate succeeded in the browser). */
export const recordPublished = mutation({
  args: { id: v.id("books"), payload: wordEstimatePayload, measuredAt: v.string() },
  handler: async (ctx, args) => {
    await requireOwnedBook(ctx, args.id);
    await ctx.db.patch("books", args.id, {
      published: { publishedAt: Date.now(), measuredAt: args.measuredAt, payload: args.payload },
    });
  },
});

const trackerBook = v.object({
  trackerBookId: v.string(),
  title: v.string(),
  author: v.optional(v.string()),
  totalPages: v.optional(v.number()),
  finished: v.boolean(),
  activityAt: v.number(),
  editionId: v.union(v.string(), v.null()),
  workId: v.union(v.string(), v.null()),
  // ISO 639, '' when unknown
  language: v.string(),
});

// Every mirrored field, so one that disappears from the tracker book (an optional one) is cleared here too
const TRACKER_FIELDS = [
  "title",
  "author",
  "totalPages",
  "finished",
  "activityAt",
  "editionId",
  "workId",
  "language",
] as const;

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

    for (const trackerBook of args.books) {
      const { trackerBookId } = trackerBook;
      const fields = Object.fromEntries(TRACKER_FIELDS.map((key) => [key, trackerBook[key]])) as Pick<
        typeof trackerBook,
        (typeof TRACKER_FIELDS)[number]
      >;
      const current = byTrackerId.get(trackerBookId) ?? unlinkedByTitle.get(normalizeTitle(fields.title));
      byTrackerId.delete(trackerBookId);
      if (!current) {
        await ctx.db.insert("books", { ownerId, trackerBookId, ...fields, createdAt: Date.now() });
        continue;
      }
      unlinkedByTitle.delete(normalizeTitle(current.title));
      const changed =
        current.trackerBookId !== trackerBookId || TRACKER_FIELDS.some((key) => current[key] !== fields[key]);
      if (changed) {
        await ctx.db.patch("books", current._id, { trackerBookId, ...fields });
      }
      // A new page count leaves the random pages drawn from the wrong range
      const [oldTotal, newTotal] = [current.totalPages, fields.totalPages];
      if (current.randomSlots?.length && oldTotal !== undefined && newTotal !== undefined && newTotal !== oldTotal) {
        if (newTotal < oldTotal) {
          // Random pages past the new end no longer come from a uniform draw
          const { slots, demote } = shrinkSlots(current.randomSlots, await pagesForBook(ctx, current._id), newTotal);
          await ctx.db.patch("books", current._id, { randomSlots: slots });
          for (const page of demote) await ctx.db.patch("pages", page._id, { origin: "chosen" });
        } else {
          await ctx.db.patch("books", current._id, { randomSlots: growSlots(current.randomSlots, oldTotal, newTotal) });
        }
      }
    }

    for (const removed of byTrackerId.values()) {
      if ((await pagesForBook(ctx, removed._id)).length === 0) {
        await ctx.db.delete("books", removed._id);
      }
    }
  },
});
