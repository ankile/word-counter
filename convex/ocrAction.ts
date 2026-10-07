"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { analyzeText, cleanOcrText, countWords } from "./textAnalysis";

// Subset of the Cloud Vision images:annotate response that we use
interface VisionResponse {
  responses: {
    textAnnotations?: {
      description?: string;
      boundingPoly?: { vertices?: { x?: number; y?: number }[] };
    }[];
  }[];
}

export const processPage = internalAction({
  args: { pageId: v.id("pages"), imageStorageId: v.id("_storage"), runningHeaders: v.array(v.string()) },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.ocr.updatePageStatus, { id: args.pageId, status: "processing" });

    const image = await ctx.storage.get(args.imageStorageId);
    const base64Image = Buffer.from(await image!.arrayBuffer()).toString("base64");

    const visionResponse = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${env.GCP_VISION_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{ image: { content: base64Image }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }] }],
      }),
    });

    if (!visionResponse.ok) {
      await ctx.runMutation(internal.ocr.updatePageStatus, {
        id: args.pageId,
        status: "error",
        error: `Vision API error: ${visionResponse.status} - ${await visionResponse.text()}`,
      });
      return;
    }

    // First annotation is the full text, the rest are individual words
    const [fullText, ...words] = ((await visionResponse.json()) as VisionResponse).responses[0].textAnnotations ?? [];
    const extractedText = cleanOcrText(fullText?.description ?? "", args.runningHeaders);
    const wordCount = countWords(extractedText);

    await ctx.runMutation(internal.ocr.updatePageStatus, {
      id: args.pageId,
      status: "done",
      extractedText,
      wordCount,
      boundingBoxes: words.map((word) => ({
        text: word.description ?? "",
        vertices: (word.boundingPoly?.vertices ?? []).map((vertex) => ({ x: vertex.x ?? 0, y: vertex.y ?? 0 })),
      })),
      readability: wordCount > 0 ? analyzeText(extractedText) : undefined,
    });
  },
});
