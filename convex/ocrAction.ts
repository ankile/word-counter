"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { analyzeText } from "./textAnalysis";

function cleanOcrText(rawText: string): string {
  let text = rawText;

  // Rejoin hyphenated words at line breaks (e.g., "well-\nfunded" → "well-funded")
  text = text.replace(/-\n(\S)/g, "-$1");

  // Split into lines for filtering
  const lines = text.split("\n");

  const cleanedLines = lines.filter((line) => {
    const trimmed = line.trim();

    // Remove lines that are just numbers (page numbers)
    if (/^\d+$/.test(trimmed)) {
      return false;
    }

    // Remove very short lines that are likely headers (e.g., "300 VIRAL BA")
    // Only filter if it's all caps and short (likely a header/title fragment)
    if (trimmed.length < 30 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
      return false;
    }

    return true;
  });

  return cleanedLines.join("\n");
}

export const processPage = action({
  args: { pageId: v.id("pages") },
  handler: async (ctx, args) => {
    // Mark as processing
    await ctx.runMutation(internal.ocr.updatePageStatus, {
      id: args.pageId,
      status: "processing",
    });

    const page = await ctx.runQuery(internal.ocr.getPage, { id: args.pageId });
    if (!page) {
      throw new Error("Page not found");
    }

    const imageUrl = await ctx.storage.getUrl(page.imageStorageId);
    if (!imageUrl) {
      await ctx.runMutation(internal.ocr.updatePageStatus, {
        id: args.pageId,
        status: "error",
        error: "Image not found in storage",
      });
      return;
    }

    const apiKey = process.env.GCP_VISION_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.ocr.updatePageStatus, {
        id: args.pageId,
        status: "error",
        error: "GCP_VISION_API_KEY not configured",
      });
      return;
    }

    // Fetch the image and convert to base64
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");

    // Call Google Cloud Vision API
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Image,
              },
              features: [
                {
                  type: "DOCUMENT_TEXT_DETECTION",
                },
              ],
            },
          ],
        }),
      }
    );

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      await ctx.runMutation(internal.ocr.updatePageStatus, {
        id: args.pageId,
        status: "error",
        error: `Vision API error: ${visionResponse.status} - ${errorText}`,
      });
      return;
    }

    const visionData = await visionResponse.json();
    const textAnnotations = visionData.responses?.[0]?.textAnnotations;

    if (!textAnnotations || textAnnotations.length === 0) {
      await ctx.runMutation(internal.ocr.updatePageStatus, {
        id: args.pageId,
        status: "done",
        extractedText: "",
        wordCount: 0,
      });
      return;
    }

    // First annotation contains the full text, rest are individual words
    const rawText = textAnnotations[0].description || "";
    const extractedText = cleanOcrText(rawText);
    const wordCount = extractedText
      .split(/\s+/)
      .filter((word: string) => word.length > 0).length;

    // Extract bounding boxes for visualization (skip first which is full text)
    const boundingBoxes = textAnnotations.slice(1).map((annotation: any) => ({
      text: annotation.description || "",
      vertices: (annotation.boundingPoly?.vertices || []).map((v: any) => ({
        x: v.x || 0,
        y: v.y || 0,
      })),
    }));

    // Compute readability metrics
    const metrics = analyzeText(extractedText);
    const readability = {
      sentenceCount: metrics.sentenceCount,
      syllableCount: metrics.syllableCount,
      avgWordsPerSentence: metrics.avgWordsPerSentence,
      avgSyllablesPerWord: metrics.avgSyllablesPerWord,
      fleschReadingEase: metrics.fleschReadingEase,
      fleschKincaidGrade: metrics.fleschKincaidGrade,
      readingLevel: metrics.readingLevel,
    };

    await ctx.runMutation(internal.ocr.updatePageStatus, {
      id: args.pageId,
      status: "done",
      extractedText,
      wordCount,
      boundingBoxes,
      readability,
    });
  },
});
