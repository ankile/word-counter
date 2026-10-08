import { collection, doc, getDoc, getDocs, type Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { WordEstimatePayload } from "../../../convex/validators";
import { db, functions } from "./firebase";

// Fields of users/{uid}/books/{bookId} in Book Tracker that we mirror
interface TrackerBookDoc {
  title: string;
  authorIds?: string[];
  pageCount?: number | null;
  finished?: boolean;
  lastReadAt?: Timestamp | null;
  createdAt: Timestamp;
  // Catalog links; null or absent when the book isn't linked
  editionId?: string | null;
  workId?: string | null;
  // ISO 639, '' or absent when unknown
  language?: string;
}

interface CatalogAuthorDoc {
  canonicalName: string;
  status?: string;
  mergedInto?: string;
}

async function authorName(authorId: string): Promise<string> {
  const author = (await getDoc(doc(db, "catalogAuthors", authorId))).data() as CatalogAuthorDoc;
  return author.status === "merged" && author.mergedInto ? await authorName(author.mergedInto) : author.canonicalName;
}

/** Read the signed-in user's Book Tracker library, resolving author IDs to names. */
export async function fetchTrackerBooks(uid: string) {
  const snapshot = await getDocs(collection(db, "users", uid, "books"));
  const books = snapshot.docs.map((d) => ({ id: d.id, data: d.data() as TrackerBookDoc }));

  const authorIds = [...new Set(books.flatMap((b) => b.data.authorIds ?? []))];
  const names = new Map(await Promise.all(authorIds.map(async (id) => [id, await authorName(id)] as const)));

  return books.map(({ id, data }) => ({
    trackerBookId: id,
    title: data.title,
    author: data.authorIds?.length ? data.authorIds.map((a) => names.get(a)!).join(", ") : undefined,
    totalPages: data.pageCount ?? undefined,
    finished: data.finished === true,
    activityAt: (data.lastReadAt ?? data.createdAt).toMillis(),
    editionId: data.editionId ?? null,
    workId: data.workId ?? null,
    language: data.language ?? "",
  }));
}

/**
 * Store a book's words-per-page estimate on its catalog edition. Book Tracker's server does the write after
 * checking that the caller owns the book and that it is linked to the edition (failed-precondition otherwise).
 */
export async function sendWordEstimate(payload: WordEstimatePayload) {
  const call = httpsCallable<WordEstimatePayload, { stored: true; measuredAt: string }>(
    functions,
    "catalog-setwordestimate"
  );
  return (await call(payload)).data;
}
