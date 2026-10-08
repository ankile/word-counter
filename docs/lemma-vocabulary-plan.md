# Plan: count real unique words (lemmas) in Word Counter

Written 2026-10-08. Not started; kept here for later. The four questions at the end need answers before phase 1.

## Problem

Word Counter counts **word forms**: `vocabularyTokens` lowercases, strips punctuation and possessive `'s`, and every
distinct string counts once. So *walk, walks, walked, walking* are four words, *be, is, was, were, been* are five, and
*Kvothe* and *Kvothe's* are one only because of the `'s` rule. The vocabulary numbers mix three things:

1. **Inflection.** English roughly doubles a lemma count into forms; Norwegian more so.
2. **Proper nouns.** Fantasy and history books carry hundreds of names that say little about difficulty.
3. **OCR noise.** Misreads (`tbe`, `rn`→`m`), words split across line-end hyphens, page furniture that survived
   cleaning. Each misread is a new "word" that shows up once, so it inflates exactly the rare tail the projection
   extrapolates from.

The goal is a vocabulary count of dictionary headwords (lemmas), with names and noise separated out. That gives
difficulty measures that compare across books and languages.

## What we would measure

Per book, each with the same rarefaction and growth-curve machinery as today, but run over lemma sets instead of
form sets:

| Measure | Meaning |
|---|---|
| Unique lemmas in the book (95% range) | the headline replacement for "unique word forms" |
| Lemmas in the first 50,000 words | vocabulary richness at a common length |
| New lemmas per 1,000 words at 50,000 | growth rate at a common length |
| Lemmas in 1,000 random words | sample-only, no extrapolation |
| Forms per lemma | how much inflection the text uses |
| Proper-noun share of types | how much of the vocabulary is names |
| OCR-noise share of types | a quality signal for the sample, not shown as difficulty |
| *(phase 4)* Rare-lemma share | share of lemmas outside the language's ~5,000 most frequent; the strongest single difficulty signal in reading research |

The current form-based numbers stay, labelled as forms, so old and new can be compared. The main page's book
comparison (`convex/difficulty.ts`, `docs/vocabulary.md#comparing-books`) gets the lemma versions of its measures.

## Approach: deterministic first, then an LLM on what's left

The hard part isn't the common case: a dictionary lemmatizer gets *walked → walk* right. The hard parts are context
(*saw* as see/saw, *leaves* as leaf/leave, *lead*), names, OCR errors, and Norwegian, where off-the-shelf JS
lemmatizers are weak. An LLM handles all four well, and the volumes are small: a sampled book is 10–15k tokens.

**Pass 1, context-free (one request per book).** Send the book's distinct forms, with a few-word snippet for each,
and ask for structured output per form:

```json
{ "form": "leaves", "lemma": "leaf", "kind": "word" | "proper" | "number" | "ocr_error" | "foreign",
  "ambiguous": true, "alternatives": ["leave"] }
```

`kind: "ocr_error"` can carry a `corrected` form. A misread of a real word then maps to that word's lemma
instead of counting as new.

**Pass 2, in context (only for ambiguous forms).** For each form marked `ambiguous`, send its occurrences with a
sentence of context, and ask for the lemma per occurrence. A typical book should have a few dozen such forms.

**Cache by language and form** (`lemmaForms` table: language, form, lemma, kind, model, promptVersion). Most forms
recur across books, so the second English book costs a fraction of the first, and re-running a book is free.
Ambiguous forms are cached per page instead (`pages.lemmaOverrides`).

**Deterministic baseline for checking.** Run an English dictionary lemmatizer in parallel on the same forms as a
check, not as the answer. Where it and the LLM disagree on a common word, log it. That disagreement list is what
gets reviewed.

## Model and API (Claude API, TypeScript SDK in a Convex action)

- **Model:** `claude-opus-5-5`, at `output_config.effort: "low"`. This is mechanical labelling, and thinking can't be
  disabled on this model. `claude-haiku-5-5` costs ~40× less and may be enough; that's your call (question 1
  below), and the evaluation in phase 1 will show whether the quality holds.
- **Structured output:** `output_config.format` with a JSON schema, so every response parses. Reject and retry a
  response whose forms don't match the request one to one.
- **Refusal fallback:** `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`. Book text can contain
  violence or other material that a classifier occasionally declines; the fallback re-runs it instead of failing the
  book. Check `stop_reason` before reading the content.
- **Backfills through the Batches API** (50% off, asynchronous). Live re-processing of a single book uses the
  normal endpoint.
- **Prompt caching** on the fixed instructions and schema, which are identical for every book.
- **Reproducibility:** pin the model ID and a `LEMMATIZER_VERSION` (like `COUNTING_VERSION`). Store the raw
  responses for audit. A version bump re-runs through a migration, as the counting rule does.
- **Key:** `ANTHROPIC_API_KEY` in the Convex environment, next to `GCP_VISION_API_KEY`.

**Rough cost per book** (≈5,000 distinct forms, ≈13,000 sampled words): pass 1 ≈ 25k input + 45k output tokens; pass 2
≈ 5k + 5k.
- **Opus 5.5:** ≈ **$1** per book, ≈ $0.50 through Batches, less once the form cache warms up.
- **Haiku 5.5:** ≈ **3 cents** per book.

**Privacy:** the sampled page text of your books goes to the Anthropic API, as it already goes to Google Vision for
OCR.

## Changes

**Word Counter**
1. `convex/lemmas.ts`: pass 1 and pass 2, cache reads and writes, version stamping. A scheduled action after OCR,
   like `ocrAction.processPage`, per book once its pages are counted.
2. Schema:
   - a `lemmaForms` table;
   - `pages.lemmaOverrides` (optional);
   - `books.lemmaStatus` (pending / done / error, with the `LEMMATIZER_VERSION`).

   These are additive fields, so the schema change needs no transitional step.
3. `vocabulary.ts`: `computeVocabularyStats` takes a token mapper (form → lemma or drop), so forms and lemmas share
   one implementation. Proper nouns and OCR noise drop out of the difficulty sets, and each is counted separately.
4. Recalibrate: `CALIBRATED_LOG_SD` was fitted on word forms from 10 Gutenberg novels (`scripts/validateVocabulary.ts`).
   Re-run that validation on lemmatized text before trusting the lemma ranges.
5. UI: the vocabulary card shows lemmas as the headline, with forms, names and noise in a breakdown.
6. Send to Book Tracker: extend `vocabulary` in the `catalog-setwordestimate` request with
   `{ uniqueLemmas, low, high, lemmatizerVersion }`. This is optional, and absent means not computed.

**Book Tracker**
1. `decodeSetWordEstimateRequest` and the stored-estimate decoder accept the new optional block (shape only, as now).
2. A deploy order where the server accepts it before Word Counter sends it.
3. A later UI decision on where lemma counts appear, if anywhere.

## Phases

1. **Evaluate before building (≈ half a day).**
   - Hand-label a gold set: 3 English pages and 2 Norwegian pages, every token with lemma and kind.
   - Run Opus 5.5 at low effort, Haiku 5.5 and the deterministic lemmatizer against it, and report the accuracy of each.
   - This settles the model question with numbers, and shows how much OCR noise the current form counts carry.
2. **Pass 1 + cache + lemma vocabulary in Word Counter**, behind the version stamp, with mutation-tested unit tests for
   the mapper and the cache. A recorded-response fixture keeps the tests offline.
3. **Pass 2, recalibration, UI.**
4. **Rare-lemma share** from a frequency list (`wordfreq` data for English and Norwegian). Then the Book Tracker
   contract extension, if wanted.

## Risks

- **LLM lemma errors on rare words.** The gold set measures this, and the disagreement log against the
  deterministic lemmatizer catches drift.
- **Calibration.** Lemma growth curves bend differently from form curves. Phase 3 re-validates the 95% ranges; until
  then the ranges are labelled provisional.
- **Cost creep from re-runs.** The form cache and version stamps mean only changed inputs are paid for.

## Questions for you (decide before phase 1)

1. **Model:** start the evaluation with Opus 5.5 (recommended default) and Haiku 5.5 side by side, then keep whichever
   passes the gold set at the lower cost? Or only Opus 5.5?
2. **Names:** leave proper nouns out of the difficulty measures and report them separately (recommended)? Or count
   them as vocabulary?
3. **Norwegian:** support it from the start (recommended; the LLM handles it, and the gold set needs 2 Norwegian
   pages), or English only first?
4. **Book Tracker:** send lemma counts to the catalog edition as part of this work, or keep them in Word Counter
   until we've lived with the numbers?
