"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getFirebaseApp() {
  const existing = getApps();
  if (existing.length > 0) {
    return existing[0];
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not configured");
  }

  const serviceAccount = JSON.parse(serviceAccountJson);
  return initializeApp({
    credential: cert(serviceAccount),
  });
}

interface FirebaseBook {
  id: string;
  title: string;
  author?: string;
  pageCount?: number;
  currentPage?: number;
  isbn?: string;
  finished?: boolean;
  pagesRead?: number;
  createdAt?: number;
  updatedAt?: number;
}

function timestampToMs(ts: unknown): number | undefined {
  if (!ts) return undefined;
  if (typeof ts === "object" && ts !== null && "_seconds" in ts) {
    return (ts as { _seconds: number })._seconds * 1000;
  }
  if (typeof ts === "object" && ts !== null && "seconds" in ts) {
    return (ts as { seconds: number }).seconds * 1000;
  }
  return undefined;
}

export const listFirebaseBooks = action({
  args: { userId: v.string() },
  handler: async (_ctx, args): Promise<FirebaseBook[]> => {
    const app = getFirebaseApp();
    const db = getFirestore(app);

    const booksRef = db.collection("users").doc(args.userId).collection("books");
    const snapshot = await booksRef.get();

    const books: FirebaseBook[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      books.push({
        id: doc.id,
        title: data.title || "Untitled",
        author: data.author,
        pageCount: data.pageCount,
        currentPage: data.currentPage,
        isbn: data.isbn,
        finished: data.finished,
        pagesRead: data.pagesRead,
        createdAt: timestampToMs(data.createdAt),
        updatedAt: timestampToMs(data.updatedAt),
      });
    });

    return books;
  },
});

export const listFirebaseUsers = action({
  args: {},
  handler: async (): Promise<{ id: string; email?: string }[]> => {
    const app = getFirebaseApp();
    const db = getFirestore(app);

    const usersRef = db.collection("users");
    const snapshot = await usersRef.get();

    const users: { id: string; email?: string }[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      users.push({
        id: doc.id,
        email: data.email,
      });
    });

    return users;
  },
});
