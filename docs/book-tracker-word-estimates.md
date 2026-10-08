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

Production on 2026-10-07: 175 mirrored books, 4 with OCR'd pages (15, 4, 18 and 1 pages), all of them chosen by hand.

## Decisions already made

- **The estimate belongs to the catalog edition, not the reader's book.** Words per page depends on the typesetting,
  which is fixed per edition. In Book Tracker, bibliographic data is public. Only who read what is private.
- **word-counter never writes to Book Tracker's Firestore.** It calls a Book Tracker callable, and the server does the
  write. This keeps the existing constraint in `CLAUDE.md` (tracker data is read-only from word-counter, no Admin SDK,
  no service-account keys).
- **No photo is thrown out, and nothing is re-sampled (owner, 2026-10-07).** Hand-chosen pages stay in the estimate.
  The fix for problem 1 is to add a few randomly drawn pages and use them to correct the hand-chosen ones (W6), not
  to replace them.
- **Precision bar (owner, 2026-10-07):** a book can be sent to Book Tracker at ±20% (95% confidence). The
  recommended target is ±10%. The app aims for ±10% when it suggests pages to add, and labels anything between 10%
  and 20% as sendable but short of the recommendation.

## How the estimate works

Pages fall into two kinds:

- **Ordinary pages:** a full page of running text, with no chapter start or end, illustration, table or blank space.
  These are what people pick by hand.
- **Other pages:** everything else in 1..`pageCount`: blanks, part titles, chapter openings and endings,
  illustrations, maps.

The book's average words per page is

```
wordsPerPage = p · mean_ordinary + (1 − p) · mean_other
```

where:

- `p` is the share of ordinary pages, estimated from **random pages only**.
- `mean_other` is the average of the random pages that are not ordinary.
- `mean_ordinary` pools **hand-chosen pages and random ordinary pages**. This is where the existing work counts in
  full. It rests on one assumption: a hand-chosen ordinary page is as typical as a random ordinary page. That's
  reasonable when someone flips to arbitrary pages of running text.

A sample with no random pages has no estimate of `p`. It gets method `chosen-pages`, is shown with a warning that it
reads high, and can't be sent. A random sample with no hand-chosen pages also works, because then the formula reduces
to the plain mean of the random pages.

Variance comes from the usual stratified (delta-method) approximation:

```
Var ≈ p²·s²_ord/n_ord + (1−p)²·s²_oth/n_oth + (mean_ord − mean_oth)²·p(1−p)/n_random
```

When there are fewer than 2 other pages, `s²_oth` falls back to the variance of all random pages. When there are
none, that term is 0 and `p = 1`. The 95% interval uses Student's t with the total sampled pages minus 2 as degrees
of freedom, which is good enough. The agents may swap in a seeded bootstrap if it holds up better in tests; the
contract only fixes the outputs.

## Changes in word-counter

Ordered by dependency. W1–W6 need nothing from Book Tracker. W7 needs the callable described under "Book Tracker side".

### W1. Mirror the catalog link and language

Extend `fetchTrackerBooks` and the `trackerBook` validator / `books` table with:

- `editionId: string | null` and `workId: string | null`. These are already on `users/{uid}/books/{id}`.
- `language: string`, an ISO 639 code (`''` when unknown). Norwegian Bokmål is stored as the macrolanguage code `no`.

These fields stay read-only. The synthetic e2e books must keep having no `workId`/`editionId` (the existing rule in
`CLAUDE.md`).

### W2. Page origin, printed page number, ordinary flag

Add three fields to `pages`:

- `origin: "chosen" | "random"`. Existing pages and ad-hoc uploads are `chosen`.
- `bookPage: v.optional(v.number())`: the printed page number. A random slot sets it. A chosen upload may set it if
  the user types it in, but doesn't have to.
- `ordinary: v.boolean()`: whether the page is an ordinary page of running text. Ask with one tap after each random
  page is OCR'd ("Ordinary page of text?", default yes). Chosen pages default to yes and can be edited.

Migration (the schema-change protocol in `CLAUDE.md`): add the fields as optional, backfill the existing pages with
`origin: "chosen", ordinary: true`, then make `origin` and `ordinary` required. Show the flag on each thumbnail so
the owner can untick existing chosen pages that turn out to be chapter openings. Nothing is deleted.

### W3. Suggest random pages to add

- Per book, store a list of suggested pages in Convex so it survives reloads and moves between phone and desktop:
  page numbers drawn uniformly without replacement from 1..`totalPages`.
- How many to suggest:
  - At least `MIN_RANDOM_PAGES` (start at 8) so that `p` can be estimated at all.
  - Beyond that, as many as the variance formula projects are needed to reach ±10%, using the current estimates.
  - Show the count for ±20% next to it ("6 more pages to send, 14 for the recommended ±10%").
  - A "suggest more" action draws additional pages.
- The book page lists the open slots ("Photograph page 214"). A photo uploaded into a slot gets `origin: "random"`
  and that slot's `bookPage`. The multi-page scan flow (`7eac708`) fills slots in order.
- **A slot can't be skipped because it's blank or has no body text.** Photograph it anyway. OCR returns zero or a
  few words, and that is the true count; the user marks it not ordinary. Skipping such pages is exactly the bias the
  random pages exist to correct. If the page can't be photographed at all (missing, torn), allow replacing the slot
  with a fresh draw. That is the only way to leave one.
- If `totalPages` changes in Book Tracker, slots beyond the new count drop out. Their photos stay, recorded as
  `chosen`.

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

Add a pure function to `convex/stats.ts` that implements "How the estimate works". It takes the done pages and
`totalPages` and returns:

```ts
{
  method: "random-pages" | "corrected-chosen" | "chosen-pages",
  // random-pages: only random pages; corrected-chosen: random + chosen (formula above);
  // chosen-pages: no random pages yet, biased high, not sendable
  chosenPages: number,
  randomPages: number,
  ordinaryShare: number | null,   // p; null for chosen-pages
  wordsPerPage: number,
  wordsPerPageLow: number,        // 95%
  wordsPerPageHigh: number,
  marginPercent: number,
  sendable: boolean,              // method !== "chosen-pages" && randomPages ≥ MIN_RANDOM_PAGES && marginPercent ≤ 20
  meetsRecommended: boolean,      // sendable && marginPercent ≤ 10
  randomPagesForSendable: number, // projected additional random pages; 0 when met
  randomPagesForRecommended: number,
  pageCountBasis: number,         // totalPages at the time of computation
  totalWords: number, totalWordsLow: number, totalWordsHigh: number,
  countingVersion: number,
}
```

`computeSamplingStats` and its "add N more pages" advice are replaced by this. Return it from `books.get`, and have
`SampleConfidence` render it instead of computing totals itself. The 4 existing books will show as `chosen-pages`
with their current numbers and a list of suggested random pages.

### W7. "Send to Book Tracker"

- The button is enabled only when all of these hold: the book has an `editionId`, `totalPages` is known, and the
  estimate is `sendable`. When disabled, say why ("Link this book to the catalog in Book Tracker first", or "Add 6
  random pages to send"). When it is sendable but not `meetsRecommended`, show the gap to ±10% next to the button.
- On click, call the `catalog-setwordestimate` callable (contract below) with `firebase/functions`, region
  `europe-west1`, from the existing app in `src/app/lib/firebase.ts`. Auth and App Check tokens are attached
  automatically, and the word-counter app is already registered for App Check.
- Store `publishedAt` and the published payload on the Convex book. Show "Sent to Book Tracker on …", or "Out of
  date" once the current estimate differs from what was sent.
- Sending is explicit, never automatic. Re-sending overwrites the earlier estimate.

### W8. Tests and release

- `npm run check` must pass. Unit tests go in `convex/stats.test.ts` for W6:
  - Zero-word other pages pull the mean down.
  - Chosen pages tighten `mean_ordinary` but never move `p`.
  - A chosen-only sample is `chosen-pages` and not sendable.
  - A random-only sample equals the plain mean.
  - The 20% and 10% thresholds flip `sendable` and `meetsRecommended`.
  - Slots past a shrunken `totalPages` become chosen.

  Add tests for the W7 gating and payload builder, and for the W2 backfill (existing pages keep their counts and
  become chosen and ordinary).
- The owner judges tests by whether they catch errors, not by how many there are. For every change, revert it
  locally and confirm its test goes red. Mutants must build cleanly, so the failure comes from the assertion and not
  from a broken build.
- e2e (`e2e/wordCounter.spec.ts`): as synthetic user A, fill suggested slots, including a blank page marked not
  ordinary, on top of a few chosen pages, and check the estimate and the "pages to add" counts. Also check that
  "Send to Book Tracker" is disabled with the "link first" reason on a synthetic (unlinked) book. Once the callable is
  deployed, call it for a synthetic book and assert the `failed-precondition` rejection is shown. That exercises
  auth, App Check and the contract end to end without writing catalog data. The owner checks one real send by hand.
- Add `catalog-setwordestimate` to the list of Book Tracker resources in `docs/testing.md`.

## Book Tracker side (not for word-counter agents)

Built in the book-tracker repo before W7 can be tested end to end. The contract:

```ts
// httpsCallable(getFunctions(app, "europe-west1"), "catalog-setwordestimate")
interface SetWordEstimateRequest {
  bookId: string;            // users/{caller uid}/books/{bookId} (= trackerBookId)
  editionId: string;         // must equal that book's editionId
  method: "random-pages" | "corrected-chosen";
  countingVersion: number;
  pageCountBasis: number;
  chosenPages: number;
  randomPages: number;
  ordinaryShare: number;
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
caller owns `bookId` and that the book is linked to `editionId`; otherwise it rejects with `failed-precondition`. It
rejects margins wider than ±20%, validates ranges, then writes `catalogEditions/{editionId}.wordEstimate` with
`createdBy` and `measuredAt`. The last write wins.

Book Tracker UI and statistics come later, in a separate step.

## Implementation status (word-counter)

W1–W8 are built. Where the spec left a choice open:

- The estimator is `computeBookEstimate` in `convex/stats.ts` (delta method, no bootstrap). It returns null until there
  are 2 chosen pages, or 3 pages once random pages are in, because the t-interval needs the degrees of freedom.
  Unknown `totalPages` gives `pageCountBasis` and the totals as `null`.
- `chosenPages` counts the chosen pages the estimate uses. Chosen pages unticked as not ordinary stay stored and
  shown, but they're left out of the estimate: as hand-picked pages they can't stand in for `mean_other`.
- Projections assume future random pages split `p : 1 − p` with the current stratum spreads. Before any random
  page exists they assume `p = 1`. They are capped at the pages left to draw.
- Slots (`books.randomSlots`) are topped up automatically to `randomPagesForRecommended` (at least
  `MIN_RANDOM_PAGES` before there's an estimate). "Suggest more" draws 4 extra.
- Readability is computed only for pages whose resolved language is `en` and aggregated only for English books.
  Pages counted before this change keep their stored scores until re-processed.
- Sending is also blocked while any counted page carries an older `countingVersion` ("Re-process N pages…").
- Pending: the e2e assertion that the callable rejects a synthetic book with `failed-precondition` waits until
  `catalog-setwordestimate` is deployed.

## Out of scope

- Deleting, replacing or re-sampling existing photos.
- Writing to Book Tracker Firestore directly, the Admin SDK, or service-account keys.
- Imputing words per page for books that haven't been sampled. Book Tracker shows coverage instead.
- Estimates for books that aren't linked to a catalog edition.
