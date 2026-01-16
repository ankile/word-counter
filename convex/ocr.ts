import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getPage = internalQuery({
  args: { id: v.id("pages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const updatePageStatus = internalMutation({
  args: {
    id: v.id("pages"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("done"),
      v.literal("error")
    ),
    extractedText: v.optional(v.string()),
    wordCount: v.optional(v.number()),
    error: v.optional(v.string()),
    boundingBoxes: v.optional(
      v.array(
        v.object({
          text: v.string(),
          vertices: v.array(
            v.object({
              x: v.number(),
              y: v.number(),
            })
          ),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});
