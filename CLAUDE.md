@AGENTS.md

# word-counter

Next.js 16 + Convex app that estimates a book's word count from photographed pages (Google Vision OCR). Users sign in
with their Book Tracker (book.ankile.com) Firebase account; the browser reads their tracker library from Firestore
and mirrors it into Convex. Setup, deployment and architecture: `README.md`. Testing: `docs/testing.md`.

## Working on it

- `npm run check` before every commit (typecheck + lint + unit tests). Run `npm run test:e2e` for anything that
  touches auth, sync, uploads/OCR or the UI. One-time e2e setup is in `docs/testing.md`.
- Drive the real app as a synthetic user: sign in as `word-counter-e2e-a@example.com` with `E2E_PASSWORD` from
  `.env.local`. Never use the owner's real account for testing.
- Deploy order: `npm run deploy:convex`, then `git push origin main` (Vercel). Then run the e2e suite against prod
  with `E2E_BASE_URL=https://word-counter.ankile.com`.
- Schema changes that would invalidate existing documents: deploy an optional/transitional schema, migrate with an
  internal mutation run via `npx convex run` (`--prod` for production), then tighten the schema and redeploy.

## Constraints

- Book Tracker's Firebase project (`book-tracker-d8f24`) is security-hardened: App Check is enforced on Auth and
  Firestore, and its service-account keys were deliberately deleted. Never create service-account keys or use the
  Admin SDK from word-counter. Admin/test tooling uses `gcloud auth print-access-token
  --account=lars.ankile@gmail.com`.
- Book Tracker data is read-only from word-counter, except for the synthetic e2e accounts' libraries
  (`e2e/testAccounts.ts`). Seeded books must not get `workId`/`editionId`, which would share them in the catalog.
- Every Convex query and mutation is owner-scoped through `convex/auth.ts`. New functions must call
  `requireUserId`, `requireOwnedBook` or `requireOwnedPage`.
- `.env.local` holds `E2E_PASSWORD` and an App Check debug token. Never commit or print them.
