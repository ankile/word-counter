import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    // Google Cloud Vision API key for OCR
    GCP_VISION_API_KEY: v.string(),
    // Firebase service account JSON for importing from Book Tracker
    FIREBASE_SERVICE_ACCOUNT_KEY: v.string(),
  },
});

export default app;
