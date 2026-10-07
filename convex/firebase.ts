"use node";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { BOOK_TRACKER_USER_ID } from "./bookTracker";
import { action, env } from "./_generated/server";

function getFirebaseApp() {
  return getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
}

export interface FirebaseBook {
  id: string;
  title: string;
  author?: string;
  pageCount?: number;
  finished?: boolean;
}

export const listFirebaseBooks = action({
  args: {},
  handler: async (): Promise<FirebaseBook[]> => {
    const snapshot = await getFirestore(getFirebaseApp())
      .collection("users")
      .doc(BOOK_TRACKER_USER_ID)
      .collection("books")
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title || "Untitled",
        author: data.author,
        pageCount: data.pageCount,
        finished: data.finished,
      };
    });
  },
});
