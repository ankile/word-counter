# Testing

Three layers, fastest first:

| Command | What it runs | Needs |
| --- | --- | --- |
| `npm run check` | TypeScript 7 typecheck, ESLint (Next + Convex rules), Vitest unit tests (`convex/*.test.ts`) | nothing |
| `npm run test:e2e` | Playwright against `next dev` on :3100 + the Convex **dev** deployment | one-time setup below |
| `E2E_BASE_URL=https://word-counter.ankile.com npm run test:e2e` | the same suite against **production** (prod Convex, real reCAPTCHA) | one-time setup below |

Each e2e run covers desktop Chrome and iPhone 15 (WebKit), 17 tests in about 3 minutes (the Book Tracker callable check runs on desktop only). Failures leave
screenshots and traces in `test-results/`; open the HTML report with `npx playwright show-report`, or a trace with
`npx playwright show-trace test-results/<test>/trace.zip`.

## One-time setup

1. `gcloud` logged in as the Book Tracker operator. The account must be credentialed but doesn't need to be active;
   scripts pass `--account` explicitly:
   ```bash
   gcloud auth login lars.ankile@gmail.com
   ```
2. Playwright browsers:
   ```bash
   npx playwright install chromium webkit
   ```
3. Synthetic accounts, credentials and App Check debug token:
   ```bash
   npm run e2e:setup
   ```
   This is idempotent. It appends `E2E_PASSWORD` and `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN` to `.env.local` only if
   they're missing, creates or updates both Auth users with that password, and seeds their libraries.

`.env.local` (gitignored, never commit it) ends up holding:

| Variable | Purpose |
| --- | --- |
| `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` | written by `npx convex dev` |
| `E2E_PASSWORD` | password shared by both synthetic accounts |
| `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN` | registered App Check debug token. Only used by `next dev` (`NODE_ENV=development`) and never shipped in production builds. Treat it as a secret: it bypasses attestation for whoever holds it. |

## How it works

- **Accounts.** `word-counter-e2e-a@example.com` and `word-counter-e2e-b@example.com` are real Firebase Auth users in
  the Book Tracker project (`book-tracker-d8f24`), with fixed UIDs `word-counter-e2e-a` and `word-counter-e2e-b`,
  verified email, and display name "word-counter e2e". The example.com addresses can't belong to a real reader.
- **Tracker data.** Before **every** test, `seedLibraries()` rewrites `users/{uid}/books` for both accounts from
  `e2e/fixtures/library.ts` and deletes any other books there. Account A has 7 books covering ordering by `lastReadAt`
  (with `createdAt` as fallback), a merged catalog author, two authors, no author, and finished books. Account B
  has 1 book, used for the isolation test.
- **Never delete fixture books.** Book Tracker's `deletebookupdates` trigger recursively deletes a deleted
  book's document asynchronously, so deleting a fixture and re-seeding the same ID can lose the re-seeded copy.
  Tests that delete tracker books create throwaway ones with random IDs (`addTemporaryTrackerBook`); seeding
  removes any leftovers.
- **Catalog safety.** Seeded books reference real `catalogAuthors` documents but have no `workId`/`editionId`, so Book
  Tracker's sharing projection never lists the test accounts as readers of a work. Keep it that way when editing the
  fixtures. Seeding fails loudly if a referenced author no longer exists.
- **word-counter data.** Before every test, `convex/testing.ts:resetE2eAccounts` (an internal mutation run via
  `npx convex run`) deletes the books, pages and images owned by the two e2e UIDs. The UIDs are hard-coded there, so
  it can't touch real users.
- **Admin access** uses `gcloud auth print-access-token --account=lars.ankile@gmail.com`, the same keyless approach as
  `book-tracker/migrate-lib.ts`. Book Tracker deleted its service-account keys during security hardening (SEC-048).
  Don't create keys for this.
- **Page photos.** `e2e/fixtures/page-{1..4}.png` are rendered public-domain pages with known word counts (122 and
  115 for the first two after the header and page number are cleaned off). `page-blank.png` carries only a page
  number, so it counts 0 words: the random-pages test photographs it into a slot and marks it not ordinary. Regenerate them with `node e2e/fixtures/renderPages.ts`
  after editing `e2e/fixtures/pages.ts`. The suite runs real Google Vision OCR (a few requests per run).
- **Scanner test.** The in-app camera (`PageScanner`) is driven by a stand-in `getUserMedia` that streams a canvas
  showing whichever fixture page the test sets, so the iPhone project can snap two pages back to back.
- **Local runs** push the working tree's Convex functions to the dev deployment (`e2e/globalSetup.ts` runs
  `npx convex dev --once`) and start `next dev` on port 3100, or reuse one that's already running.
- **A second checkout (such as a worktree)** must not share the dev deployment or port 3100 with another checkout
  under test: pushes overwrite each other's backend, and Playwright would reuse the other checkout's `next dev`. Give
  it a local Convex backend and its own port:
  ```bash
  npx convex dev --configure existing --team lars-ankile --project word-counter --dev-deployment local --once
  npx convex env set GCP_VISION_API_KEY <key>   # the dev deployment's key
  npx convex dev --tail-logs disable            # keep running: it hosts the local backend and pushes changes
  E2E_PORT=3101 npm run test:e2e                # globalSetup skips its push for local deployments
  ```
  It also needs its own `npm ci`: Turbopack rejects a symlinked `node_modules`.

Manual helpers:

```bash
node e2e/testAccounts.ts seed                  # reseed both tracker libraries
node e2e/testAccounts.ts reset-convex          # wipe the e2e accounts' word-counter data (dev)
node e2e/testAccounts.ts reset-convex --prod   # ... on production
```

To try the app by hand as a test account, sign in at http://localhost:3000 (or production) with
`word-counter-e2e-a@example.com` and the `E2E_PASSWORD` from `.env.local`.

## Release checklist

```bash
npm run check
npm run test:e2e                     # local, against Convex dev
npm run deploy:convex                # backend first, so the new frontend's functions exist
git push origin main                 # Vercel deploys the frontend (~30 s)
E2E_BASE_URL=https://word-counter.ankile.com npm run test:e2e
node e2e/testAccounts.ts reset-convex --prod   # optional: leave no test data in prod
```

## Troubleshooting

- **`Reauthentication failed` / `print-access-token` errors**: run `gcloud auth login lars.ankile@gmail.com`.
- **Sign-in hangs or Firestore returns `permission-denied` locally**: the App Check debug token was probably revoked.
  Delete the `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN` line from `.env.local` and run `npm run e2e:setup` again to register
  a new one, then restart `next dev` (env vars are read at startup).
- **"Wrong email or password" for a test account**: `npm run e2e:setup` resets both passwords to `E2E_PASSWORD`.
- **Seeding fails with 404 on `catalogAuthors/...`**: Book Tracker merged or removed an author the fixtures use.
  Point `AUTHORS` in `e2e/fixtures/library.ts` at a current author.
- **Word counts off by a few**: OCR tolerance is ±2 words (`WORD_TOLERANCE`). Larger drift means a cleanup or OCR
  regression; check `convex/textAnalysis.ts`.

## What lives in the Book Tracker Firebase project

word-counter depends on these resources in `book-tracker-d8f24`. All were added for this app; Book Tracker's own app,
keys and rules weren't changed.

| Resource | ID | Notes |
| --- | --- | --- |
| Firebase web app "word-counter" | `1:440931185227:web:3325ac44d96f668ce8d3ce` | config in `src/app/lib/firebase.ts` |
| Browser API key (auto-created for the app) | `AIzaSyCoQ…T791fw` | Firebase's default API restrictions |
| reCAPTCHA Enterprise key "word-counter-appcheck" | `6LdUCOMtAAAAAEkvlPOGGHnNefhflkHN7X_O4gln` | allowed on `word-counter.ankile.com`, `localhost`. A new domain needs adding here. |
| App Check registration | reCAPTCHA Enterprise, min score 0.5 | same settings as Book Tracker |
| App Check debug token "word-counter e2e (local .env.local)" | (secret) | list or revoke: Firebase console → App Check → Apps → word-counter → Manage debug tokens |
| Auth users `word-counter-e2e-a`, `word-counter-e2e-b` | fixed UIDs | plus their `users/{uid}` docs (created by Book Tracker's auth trigger) and seeded books |
| API key "word-counter" | Vision API only | the `GCP_VISION_API_KEY` used by Convex for OCR |
| Callable `catalog-setwordestimate` (europe-west1) | Book Tracker function | stores a book's words-per-page estimate on its catalog edition; called from the browser by "Send to Book Tracker" ([contract](book-tracker-word-estimates.md#book-tracker-side-not-for-word-counter-agents)). Owned and deployed by Book Tracker. |

**Removing the test accounts is one-way.** Deleting an Auth user fires Book Tracker's account-deletion trigger, which
tombstones `users/{uid}` (SEC-006). Book Tracker's rules then treat that UID as deleted, so if you need test accounts
again, change the UIDs in `e2e/testAccounts.ts` **and** `convex/testing.ts` rather than reusing them.
