# Publishing word estimates to Book Tracker

Handoff for word-counter agents. Written 2026-10-07 from the Book Tracker side.

## Goal

Book Tracker should be able to turn its page-based statistics into word-based ones: words per minute instead of
pages per hour, words read per year, and time-left estimates that don't break when two books have different
typesetting. To do that it needs one trustworthy number per edition: **average words per numbered page**, together
with its uncertainty and how it was measured. Book Tracker multiplies that by `pageCount` to get total words, and by
the `fromPage`/`toPage` of each reading session to get words per session.

word-counter is where that number gets measured. Today it measures it in a way Book Tracker can't use yet:

1. **The sample is biased high.** People photograph full text pages. But `pageCount` (the last printed page number)
   also covers blank versos, part-title pages, chapter openings and illustrations. Mean words on chosen full pages ×
   `pageCount` overstates the total, probably by 5–15%.
2. **Photos aren't tied to page numbers.** `pages.pageNumber` is the upload order, not the printed page number.
3. **The estimate can't be linked to anything in Book Tracker.** The mirror in `src/app/lib/bookTracker.ts` doesn't
   copy `editionId` or `workId`, and there is no way to send the result back.
4. **Readability scores are wrong for non-English books.** The syllable heuristic and the Flesch formulas are
   English-only, and many of the owner's books are Norwegian.
5. **The estimate is never stored.** `SampleConfidence.tsx` computes the total in the browser.

Production on 2026-10-07: 175 mirrored books, 4 with OCR'd pages (15, 4, 18 and 1 pages), all of them chosen samples.

## Decisions already made

- **The estimate belongs to the catalog edition, not the reader's book.** Words per page depends on the typesetting,
  which is fixed per edition. In Book Tracker, bibliographic data is public. Only who read what is private.
- **word-counter never writes to Book Tracker's Firestore.** It calls a Book Tracker callable, and the server does the
  write. This keeps the existing constraint in `CLAUDE.md` (tracker data is read-only from word-counter, no Admin SDK,
  no service-account keys).
- **Sampling is random over printed page numbers 1..`pageCount`.** The mean over uniformly random pages, blanks
  included, times `pageCount` is an unbiased total. This fixes problem 1 instead of guessing a correction factor.

## Changes in word-counter

Ordered by dependency. W1–W6 need nothing from Book Tracker. W7 needs the callable described under "Book Tracker side".

### W1. Mirror the catalog link and language

Extend `fetchTrackerBooks` and the `trackerBook` validator / `books` table with:

- `editionId: string | null` and `workId: string | null`. These are already on `users/{uid}/books/{id}`.
- `language: string`, an ISO 639 code (`''` when unknown). Norwegian Bokmål is stored as the macrolanguage code `no`.

These fields stay read-only. The synthetic e2e books must keep having no `workId`/`editionId` (the existing rule in
`CLAUDE.md`).

### W2. Record the printed page number of every photo

Add `bookPage: v.optional(v.number())` to `pages`, separate from the upload-order `pageNumber`. A photo taken for a
sampling slot (W3) gets that slot's page number. Existing pages keep `bookPage` unset and count as chosen samples.
Follow the schema-change protocol in `CLAUDE.md`: optional field first; tightening it is unnecessary because ad-hoc
uploads stay allowed.

### W3. Random sampling plan

- Per book, store a sampling plan in Convex so it survives reloads and moves between phone and desktop: page numbers
  drawn uniformly without replacement from 1..`totalPages`. Start with about 10 pages. A "draw more pages" action
  appends more draws.
- The book page lists the plan's open slots ("Photograph page 214"). A photo uploaded into a slot gets that slot's
  `bookPage`. The multi-page scan flow (`7eac708`) should fill slots in order.
- **A slot can't be skipped because it's blank or has no body text.** Photograph it anyway. OCR returns zero or a
  few words, and that is the true count. Skipping those pages is exactly the bias this replaces. If the page can't be
  photographed at all (missing, torn), allow replacing the slot with a fresh draw. That is the only way to leave one.
- If `totalPages` changes in Book Tracker, slots beyond the new count drop out of the plan, and their photos drop
  out of the random sample.
- Ad-hoc uploads outside the plan remain allowed (they are useful for vocabulary and readability). They don't count
  toward the random sample.

### W4. Freeze the counting rule

Book Tracker compares numbers across books, so the definition of a word on a page must stay stable. Keep the current
rule: cleaned OCR text, page numbers and running headers dropped, footnotes kept, whitespace tokens. Add a
`COUNTING_VERSION` constant to `textAnalysis.ts` and stamp it on each page when it is counted. When the rule changes,
bump the version, re-run a migration like `recleanPages`, and re-publish (W7 sends the version).

### W5. Language-aware readability

- Resolve a book's language as: the mirrored tracker `language` if set, otherwise the language Vision detects
  (`fullTextAnnotation.pages[].property.detectedLanguages`, which means also reading `fullTextAnnotation` in
  `ocrAction.ts`).
- Compute and show Flesch scores only for English (`en`). For other languages store none, and have the UI say
  "readability scores are English-only".
- Word counts and the vocabulary estimate are fine in any language (`vocabularyTokens` already uses `\p{L}`).

### W6. A server-side book estimate

Add a pure function to `convex/stats.ts` (next to `computeSamplingStats`). It takes the done pages and `totalPages`
and returns:

```ts
{
  method: "random-pages" | "chosen-pages",  // random when ≥ MIN_RANDOM_PAGES planned pages are done
  sampledPages: number,                     // pages behind the mean (planned only, when random)
  zeroWordPages: number,
  wordsPerPage: number,                     // mean, zero-word pages included
  wordsPerPageLow: number,                  // 95% t-interval, the same as computeSamplingStats
  wordsPerPageHigh: number,
  marginPercent: number,
  pageCountBasis: number,                   // totalPages at the time of computation
  totalWords: number, totalWordsLow: number, totalWordsHigh: number,
  countingVersion: number,
}
```

When the random sample is big enough, use only planned pages. Otherwise use every done page and report
`chosen-pages`. Return it from `books.get`, and have `SampleConfidence` render this instead of computing totals itself.

### W7. "Send to Book Tracker"

- The button is enabled only when all of these hold: the book has an `editionId`, `totalPages` is known,
  `method === "random-pages"`, and `marginPercent ≤ 20`. When disabled, say why (e.g. "Link this book to the catalog
  in Book Tracker first").
- On click, call the `catalog-setwordestimate` callable (contract below) with `firebase/functions`, region
  `europe-west1`, from the existing app in `src/app/lib/firebase.ts`. Auth and App Check tokens are attached
  automatically, and the word-counter app is already registered for App Check.
- Store `publishedAt` and the published payload on the Convex book. Show "Sent to Book Tracker on …", or "Out of
  date" once the current estimate differs from what was sent.
- Sending is explicit, never automatic. Re-sending overwrites the earlier estimate.

### W8. Tests and release

- `npm run check` must pass. Unit tests go in `convex/stats.test.ts` for W6: zero-word pages pull the mean down,
  planned and ad-hoc pages are kept apart, the method switches at the threshold, slots past a shrunken `totalPages`
  are dropped. Add tests for the W7 gating and payload builder.
- The owner judges tests by whether they catch errors, not by how many there are. For every change, revert it
  locally and confirm its test goes red. Mutants must build cleanly, so the failure comes from the assertion and not
  from a broken build.
- e2e (`e2e/wordCounter.spec.ts`): fill a sampling plan as synthetic user A, including a blank page, and check the
  estimate. Also check that "Send to Book Tracker" is disabled with the "link first" reason on a synthetic (unlinked)
  book. Once the callable is deployed, call it for a synthetic book and assert the `failed-precondition` rejection is
  shown. That exercises auth, App Check and the contract end to end without writing catalog data. The owner checks
  one real publish by hand.
- Add `catalog-setwordestimate` to the list of Book Tracker resources in `docs/testing.md`.

## Book Tracker side (not for word-counter agents)

Built in the book-tracker repo before W7 can be tested end to end. The contract:

```ts
// httpsCallable(getFunctions(app, "europe-west1"), "catalog-setwordestimate")
interface SetWordEstimateRequest {
  bookId: string;            // users/{caller uid}/books/{bookId} (= trackerBookId)
  editionId: string;         // must equal that book's editionId
  method: "random-pages" | "chosen-pages";
  countingVersion: number;
  pageCountBasis: number;
  sampledPages: number;
  zeroWordPages: number;
  wordsPerPage: number;
  wordsPerPageLow: number;
  wordsPerPageHigh: number;
  language: string;          // ISO 639, '' unknown
  readability: { fleschKincaidGrade: number; fleschReadingEase: number } | null;  // English only
  vocabulary: { uniqueWords: number; low: number; high: number } | null;
}
interface SetWordEstimateResponse { stored: true; measuredAt: string }  // ISO timestamp
```

The server requires a verified email and App Check (the same as the other catalog callables). It checks that the
caller owns `bookId` and that the book is linked to `editionId`; otherwise it rejects with `failed-precondition`.
It validates ranges, then writes `catalogEditions/{editionId}.wordEstimate` with `createdBy` and `measuredAt`. The
last write wins.

Book Tracker UI and statistics come later, in a separate step.

## Out of scope

- Writing to Book Tracker Firestore directly, the Admin SDK, or service-account keys.
- Imputing words per page for books that haven't been sampled. Book Tracker shows coverage instead.
- Estimates for books that aren't linked to a catalog edition.

## Open questions for the owner

1. Is ±20% at 95% the right bar for sending, or should it be ±10% (the app's current "high confidence")?
2. Should the 4 existing chosen-page samples be re-sampled randomly, or be sendable as `chosen-pages` with a caveat?
   This doc assumes re-sampling.
