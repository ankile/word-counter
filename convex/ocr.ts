import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { boundingBox, pageStatus, readability } from "./validators";

export const updatePageStatus = internalMutation({
  args: {
    id: v.id("pages"),
    status: pageStatus,
    extractedText: v.optional(v.string()),
    wordCount: v.optional(v.number()),
    countingVersion: v.optional(v.number()),
    language: v.optional(v.string()),
    error: v.optional(v.string()),
    boundingBoxes: v.optional(v.array(boundingBox)),
    readability: v.optional(readability),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    // Absent optional fields are written as undefined, which clears stale results from a previous run
    await ctx.db.patch("pages", id, {
      extractedText: undefined,
      wordCount: undefined,
      countingVersion: undefined,
      language: undefined,
      error: undefined,
      boundingBoxes: undefined,
      readability: undefined,
      ...updates,
    });
  },
});
