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

    // Calculate sampling statistics for word count estimation
    const processedPages = pages.filter((p) => p.status === "done" && p.wordCount !== undefined);
    let samplingStats = null;

    if (processedPages.length >= 2) {
      const wordCounts = processedPages.map((p) => p.wordCount!);
      const n = wordCounts.length;
      const mean = wordCounts.reduce((a, b) => a + b, 0) / n;

      // Sample standard deviation (using n-1 for unbiased estimate)
      const variance = wordCounts.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1);
      const stdDev = Math.sqrt(variance);

      // Coefficient of variation
      const cv = mean > 0 ? stdDev / mean : 0;

      // Sample size needed for ±10% precision at 95% confidence
      // n = (z * CV / margin)^2 where z = 1.96 for 95% CI
      const marginTarget = 0.10; // 10%
      const zScore = 1.96;
      const recommendedSampleSize = Math.ceil(Math.pow((zScore * cv) / marginTarget, 2));

      // Standard error of the mean
      const standardError = stdDev / Math.sqrt(n);

      // 95% confidence interval for mean words per page
      const marginOfError = zScore * standardError;
      const ciLower = Math.max(0, mean - marginOfError);
      const ciUpper = mean + marginOfError;

      // Confidence level based on sample size vs recommended
      let confidenceLevel: "low" | "medium" | "high";
      if (n >= recommendedSampleSize) {
        confidenceLevel = "high";
      } else if (n >= recommendedSampleSize * 0.5) {
        confidenceLevel = "medium";
      } else {
        confidenceLevel = "low";
      }

      // Current margin of error as percentage
      const currentMarginPercent = mean > 0 ? (marginOfError / mean) * 100 : 0;

      samplingStats = {
        sampleSize: n,
        mean: Math.round(mean * 10) / 10,
        stdDev: Math.round(stdDev * 10) / 10,
        cv: Math.round(cv * 1000) / 10, // as percentage with 1 decimal
        recommendedSampleSize: Math.max(recommendedSampleSize, 2),
        additionalPagesNeeded: Math.max(0, recommendedSampleSize - n),
        confidenceLevel,
        currentMarginPercent: Math.round(currentMarginPercent * 10) / 10,
        ciLowerPerPage: Math.round(ciLower),
        ciUpperPerPage: Math.round(ciUpper),
      };
    }

    return {
      ...book,
      totalWordCount,
      pageCount: pages.length,
      processedCount,
      avgReadability,
      samplingStats,
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
    totalPages: v.optional(v.number()),
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
      totalPages: args.totalPages,
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
