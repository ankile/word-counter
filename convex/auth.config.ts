import type { AuthConfig } from "convex/server";

// Users sign in with their Book Tracker (Firebase Auth) account; Convex verifies the Firebase ID token.
export default {
  providers: [
    {
      domain: "https://securetoken.google.com/book-tracker-d8f24",
      applicationID: "book-tracker-d8f24",
    },
  ],
} satisfies AuthConfig;
