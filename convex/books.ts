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

    // Compute average readability from pages that have metrics
    const pagesWithReadability = pages.filter((p) => p.readability);
    let avgReadability = null;
    if (pagesWithReadability.length > 0) {
      const totals = pagesWithReadability.reduce(
        (acc, page) => ({
          fleschReadingEase: acc.fleschReadingEase + page.readability!.fleschReadingEase,
          fleschKincaidGrade: acc.fleschKincaidGrade + page.readability!.fleschKincaidGrade,
          avgWordsPerSentence: acc.avgWordsPerSentence + page.readability!.avgWordsPerSentence,
          avgSyllablesPerWord: acc.avgSyllablesPerWord + page.readability!.avgSyllablesPerWord,
        }),
        { fleschReadingEase: 0, fleschKincaidGrade: 0, avgWordsPerSentence: 0, avgSyllablesPerWord: 0 }
      );
      const count = pagesWithReadability.length;
      avgReadability = {
        fleschReadingEase: Math.round((totals.fleschReadingEase / count) * 10) / 10,
        fleschKincaidGrade: Math.round((totals.fleschKincaidGrade / count) * 10) / 10,
        avgWordsPerSentence: Math.round((totals.avgWordsPerSentence / count) * 10) / 10,
        avgSyllablesPerWord: Math.round((totals.avgSyllablesPerWord / count) * 100) / 100,
        readingLevel: getReadingLevel(totals.fleschReadingEase / count),
      };
    }

    const processedCount = pages.filter((p) => p.status === "done").length;

    return {
      ...book,
      totalWordCount,
      pageCount: pages.length,
      processedCount,
      avgReadability,
    };
  },
});

function getReadingLevel(score: number): string {
  if (score >= 90) return "Very Easy (5th grade)";
  if (score >= 80) return "Easy (6th grade)";
  if (score >= 70) return "Fairly Easy (7th grade)";
  if (score >= 60) return "Standard (8th-9th grade)";
  if (score >= 50) return "Fairly Difficult (10th-12th grade)";
  if (score >= 30) return "Difficult (College)";
  return "Very Difficult (College graduate)";
}

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

export const importFromFirebase = mutation({
  args: {
    firebaseId: v.string(),
    firebaseUserId: v.string(),
    title: v.string(),
    author: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if book with this Firebase ID already exists
    const existing = await ctx.db
      .query("books")
      .withIndex("by_firebase_id", (q) => q.eq("firebaseId", args.firebaseId))
      .first();

    if (existing) {
      return existing._id;
    }

    const bookId = await ctx.db.insert("books", {
      title: args.title,
      author: args.author,
      createdAt: Date.now(),
      firebaseId: args.firebaseId,
      firebaseUserId: args.firebaseUserId,
    });
    return bookId;
  },
});

export const getByFirebaseId = query({
  args: { firebaseId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("books")
      .withIndex("by_firebase_id", (q) => q.eq("firebaseId", args.firebaseId))
      .first();
  },
});
