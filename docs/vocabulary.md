# Unique-word estimate

Each book page shows an estimate of how many distinct words the whole book uses, from the pages you've
photographed. It needs at least 4 processed pages and the book's page count from Book Tracker.
Code: `convex/vocabulary.ts` (math), `src/app/components/VocabularyCard.tsx` (card and chart).

## Method

1. **Word forms.** Lowercased runs of letters; inner apostrophes are kept (`don't`); hyphenated words split
   into parts; possessive `'s` is dropped. There's no lemmatization, so `run`, `ran` and `running` are three
   words. OCR mistakes and fragments from a facing page add a few spurious forms.
2. **Rarefaction.** The raw count of new words on each page depends on scan order. Instead,
   V(k) = expected distinct words in k pages drawn at random from the sample, computed exactly: a word on d
   of n pages is missed by a k-page draw with probability C(n−d, k)/C(n, k). The chart's dots are
   V(k) − V(k−1), the expected new words on the k-th page.
3. **Growth curve.** log V = a + b·log k + c·(log k)², by least squares: Heaps' law with an exponent that
   may slow down. The local exponent b + 2c·log n is shown as the "growth exponent". Past the curve's peak,
   if it bends down, vocabulary is held flat.
4. **Projection.** V(total pages).
5. **95% range.** exp(log V ± 1.96·σ), where σ = max(0.72/√n, leave-one-page-out jackknife sd).

## Why not plain Heaps' law (V = K·k^β)?

Vocabulary growth slows faster than a constant exponent allows, so a straight line in log-log space,
extrapolated 20–100× past the sample, overshoots. On 10 Project Gutenberg novels (2.5k–17.5k distinct words),
plain Heaps overestimated by **×1.6–1.9** from 10–15 pages. The curved fit is unbiased within ±3%:

| Pages sampled | Bias | sd of log error | 95% range coverage |
| --- | --- | --- | --- |
| 4 | ×0.98 | 0.40 | 96% |
| 6 | ×1.01 | 0.28 | 98% |
| 10 | ×1.01 | 0.20 | 98% |
| 15 | ×1.02 | 0.16 | 96% |
| 30 | ×1.03 | 0.12 | 97% |
| 50 | ×1.03 | 0.10 | 94% |

The leave-one-out jackknife on its own covered only 53–79% from 15+ pages, because it captures sampling
noise but not model error. That's why the range uses the error measured on the novels. Coverage is
in-sample: σ was calibrated on the same books.

Samples alternated between consecutive runs and random pages. Consecutive pages from the start of a book
run about 5% low, because nearby pages share names and topics. Pages spread through the book are better.

Reproduce with `node scripts/validateVocabulary.ts <dir of Gutenberg .txt files>`; the header of that
script has the download command. Re-run it if you change the tokenizer, the curve or the range.
