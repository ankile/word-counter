/**
 * Synthetic Book Tracker accounts for end-to-end tests.
 *
 * Talks to the production Book Tracker Firebase project (book-tracker-d8f24) as its operator through
 * `gcloud auth print-access-token`, the same keyless approach as book-tracker/migrate-lib.ts. The
 * accounts have fixed UIDs and @example.com emails so they can never collide with a real reader.
 *
 * CLI: node e2e/testAccounts.ts setup | seed | reset-convex [--prod]
 */
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { daysAgo, LIBRARY_A, LIBRARY_B, type SeedBook } from "./fixtures/library.ts";

const PROJECT_ID = "book-tracker-d8f24";
const PROJECT_NUMBER = "440931185227";
const WEB_APP_ID = "1:440931185227:web:3325ac44d96f668ce8d3ce";
const OPERATOR_ACCOUNT = "lars.ankile@gmail.com";
const ENV_FILE = ".env.local";

export const ACCOUNT_A = { uid: "word-counter-e2e-a", email: "word-counter-e2e-a@example.com", library: LIBRARY_A };
export const ACCOUNT_B = { uid: "word-counter-e2e-b", email: "word-counter-e2e-b@example.com", library: LIBRARY_B };
const ACCOUNTS = [ACCOUNT_A, ACCOUNT_B];

export function loadEnv() {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

export function testPassword(): string {
  return process.env.E2E_PASSWORD!;
}

let cachedToken: string | undefined;
function operatorToken(): string {
  cachedToken ??= execFileSync("gcloud", ["auth", "print-access-token", `--account=${OPERATOR_ACCOUNT}`], {
    encoding: "utf8",
  }).trim();
  return cachedToken;
}

async function googleApi(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${operatorToken()}`,
      "x-goog-user-project": PROJECT_ID,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    // A hung request should fail the test quickly with a clear error, not eat the whole test timeout
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${method} ${url} → ${response.status}: ${await response.text()}`);
  return await response.json();
}

// ---- Firebase Auth ----

const AUTH = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}`;

async function ensureAuthUser(uid: string, email: string, password: string) {
  const fields = { localId: uid, email, password, emailVerified: true, displayName: "word-counter e2e" };
  const { users } = await googleApi(`${AUTH}/accounts:lookup`, "POST", { localId: [uid] });
  if (users) await googleApi(`${AUTH}/accounts:update`, "POST", fields);
  else await googleApi(`${AUTH}/accounts`, "POST", fields);
}

// ---- Firestore ----

const DB = `projects/${PROJECT_ID}/databases/(default)/documents`;
const FIRESTORE = `https://firestore.googleapis.com/v1/${DB}`;

type Value = string | number | boolean | null | Date | Value[] | { ref: string };

function encode(value: Value): unknown {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === "object") return { referenceValue: `${DB}/${value.ref}` };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
}

async function setDocument(path: string, data: Record<string, Value>) {
  const fields = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]));
  await googleApi(`${FIRESTORE}/${path}`, "PATCH", { fields });
}

async function deleteDocument(path: string) {
  await googleApi(`${FIRESTORE}/${path}`, "DELETE");
}

/** Shape matches Book Tracker's own book documents (src/lib/firebase/db.ts addBook), minus catalog links. */
function bookDocument(uid: string, book: SeedBook, now: number): Record<string, Value> {
  const lastReadAt = book.lastReadDaysAgo === null ? null : daysAgo(book.lastReadDaysAgo, now);
  return {
    title: book.title,
    authorIds: book.authorIds,
    pageCount: book.pageCount,
    currentPage: book.finished ? (book.pageCount ?? 0) : 0,
    currentPageUpdateId: null,
    pagesRead: 0,
    timeRead: 0,
    finished: book.finished,
    finishedAt: book.finished ? lastReadAt : null,
    lastReadAt,
    activeTimer: null,
    owner: { ref: `users/${uid}` },
    createdAt: daysAgo(book.createdDaysAgo, now),
    updatedAt: daysAgo(book.lastReadDaysAgo ?? book.createdDaysAgo, now),
  };
}

async function listBookIds(uid: string): Promise<string[]> {
  const { documents } = await googleApi(`${FIRESTORE}/users/${uid}/books?pageSize=300`);
  return (documents ?? []).map((d: { name: string }) => d.name.split("/").pop()!);
}

/** Replace both accounts' tracker libraries with the fixtures. */
export async function seedLibraries() {
  // Fail loudly if the catalog authors the fixtures reference have changed
  const authorIds = new Set(ACCOUNTS.flatMap((a) => a.library.flatMap((b) => b.authorIds)));
  await Promise.all([...authorIds].map((id) => googleApi(`${FIRESTORE}/catalogAuthors/${id}`)));

  const now = Date.now();
  for (const { uid, library } of ACCOUNTS) {
    const keep = new Set(library.map((b) => b.id));
    for (const id of await listBookIds(uid)) {
      if (!keep.has(id)) await deleteDocument(`users/${uid}/books/${id}`);
    }
    await Promise.all(library.map((book) => setDocument(`users/${uid}/books/${book.id}`, bookDocument(uid, book, now))));
  }
}

/** Overwrite one field set of a tracker book, as if the reader edited it in Book Tracker. */
export async function updateTrackerBook(uid: string, bookId: string, changes: Partial<SeedBook>) {
  const book = { ...[...LIBRARY_A, ...LIBRARY_B].find((b) => b.id === bookId)!, ...changes };
  await setDocument(`users/${uid}/books/${bookId}`, bookDocument(uid, book, Date.now()));
}

/**
 * Add a throwaway book (random ID) to a tracker library. Tests that delete tracker books must use these:
 * Book Tracker's deletion trigger (deletebookupdates) recursively deletes the book document asynchronously,
 * so deleting a fixture and re-seeding the same ID can have the re-seeded copy deleted moments later.
 */
export async function addTemporaryTrackerBook(uid: string, title: string): Promise<string> {
  const id = `e2e-temp-${randomUUID()}`;
  const book: SeedBook = { id, title, authorIds: [], pageCount: 200, finished: false, lastReadDaysAgo: 0, createdDaysAgo: 0 };
  await setDocument(`users/${uid}/books/${id}`, bookDocument(uid, book, Date.now()));
  return id;
}

/** Only for temporary books; see addTemporaryTrackerBook. */
export async function deleteTrackerBook(uid: string, bookId: string) {
  await deleteDocument(`users/${uid}/books/${bookId}`);
}

// ---- Convex ----

/** Wipe the e2e accounts' word-counter data (books, pages, images) on the dev or prod deployment. */
export function resetConvex(prod: boolean) {
  execFileSync("npx", ["convex", "run", ...(prod ? ["--prod"] : []), "testing:resetE2eAccounts"], {
    stdio: "inherit",
    // A stalled CLI call should fail the test, not hang the run
    timeout: 120_000,
  });
}

// ---- One-time setup ----

/** Register an App Check debug token for the word-counter web app so headless browsers pass attestation. */
async function registerAppCheckDebugToken(): Promise<string> {
  const token = randomUUID();
  await googleApi(`https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT_NUMBER}/apps/${WEB_APP_ID}/debugTokens`, "POST", {
    displayName: "word-counter e2e (local .env.local)",
    token,
  });
  return token;
}

/** Create credentials (stored in the gitignored .env.local), the Auth users, and their libraries. */
export async function setup() {
  loadEnv();
  if (!process.env.E2E_PASSWORD) {
    const password = randomBytes(18).toString("base64url");
    appendFileSync(ENV_FILE, `\n# Synthetic Book Tracker e2e accounts (e2e/testAccounts.ts)\nE2E_PASSWORD=${password}\n`);
    process.env.E2E_PASSWORD = password;
  }
  if (!process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN) {
    const token = await registerAppCheckDebugToken();
    appendFileSync(
      ENV_FILE,
      `# App Check debug token registered for the word-counter web app; dev server only, never commit\nNEXT_PUBLIC_APPCHECK_DEBUG_TOKEN=${token}\n`
    );
  }
  for (const { uid, email } of ACCOUNTS) await ensureAuthUser(uid, email, testPassword());
  await seedLibraries();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  const [command, flag] = process.argv.slice(2);
  if (command === "setup") await setup();
  else if (command === "seed") await seedLibraries();
  else if (command === "reset-convex") resetConvex(flag === "--prod");
  else throw new Error("Usage: node e2e/testAccounts.ts setup | seed | reset-convex [--prod]");
  console.log(`${command}: done`);
}
