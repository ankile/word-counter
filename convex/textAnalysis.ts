/**
 * Text utilities: OCR cleanup, word counting, and readability metrics.
 */

import type { Readability } from "./validators";

/**
 * Version of the word-counting rule: cleanOcrText (page numbers and running headers dropped, footnotes kept)
 * followed by countWords (whitespace tokens). Book Tracker compares counts across books, so bump this whenever
 * either changes, then run migrations:reprocessStalePages and re-send published estimates.
 */
export const COUNTING_VERSION = 1;

/** ISO 639 code from a BCP-47 tag, as Book Tracker stores it: primary subtag, Bokmål as "no"; '' if invalid. */
export function normalizeLanguageCode(tag: string): string {
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  const code = primary === "nb" ? "no" : primary;
  return /^[a-z]{2,3}$/.test(code) ? code : "";
}

// Lowercase letters/digits/spaces only, with page numbers at either end removed
const normalizeHeader = (line: string) =>
  line
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/^[\d\s]+|[\d\s]+$/g, "")
    .replace(/\s+/g, " ");

/**
 * Clean raw OCR output with light heuristics:
 * - Rejoin hyphenated words at line breaks ("well-\nfunded" → "well-funded")
 * - Drop lines that are just numbers (page numbers)
 * - Drop short all-caps lines (running headers like "300 VIRAL BA")
 * - Drop running headers: lines that are the book's title or an author's name, optionally with a page number
 */
export function cleanOcrText(rawText: string, runningHeaders: string[] = []): string {
  const headers = new Set(runningHeaders.map(normalizeHeader).filter((h) => h.length > 0));
  return rawText
    .replace(/-\n(\S)/g, "-$1")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (/^\d+$/.test(trimmed)) return false;
      if (headers.has(normalizeHeader(trimmed))) return false;
      const isShortAllCaps =
        trimmed.length < 30 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
      return !isShortAllCaps;
    })
    .join("\n");
}

/**
 * Count whitespace-separated tokens. This is the stored per-page word count.
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Count syllables in a word using a simple heuristic.
 * - Count vowel groups (a, e, i, o, u, y)
 * - Subtract 1 for silent 'e' at end
 * - Minimum 1 syllable per word
 */
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length === 0) return 0;
  if (word.length <= 3) return 1;

  const vowelGroups = word.match(/[aeiouy]+/g);
  let count = vowelGroups ? vowelGroups.length : 1;

  // Subtract for silent 'e' at end (but not 'le')
  if (word.endsWith("e") && !word.endsWith("le")) {
    count = Math.max(1, count - 1);
  }

  // Common suffixes that add syllables
  if (word.endsWith("ia") || word.endsWith("io")) {
    count += 1;
  }

  return Math.max(1, count);
}

/**
 * Split text into sentences on . ! ? followed by whitespace or end of string.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+(?:\s+|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Split text into alphabetic words (punctuation and digits stripped).
 */
function splitWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z'-]/g, ""))
    .filter((w) => w.length > 0);
}

const round = (x: number, decimals: number) => Math.round(x * 10 ** decimals) / 10 ** decimals;

/**
 * Analyze text and compute Flesch readability metrics. English only: the syllable heuristic and the Flesch
 * formulas don't apply to other languages.
 */
export function analyzeText(text: string): Readability {
  const words = splitWords(text);
  const wordCount = words.length;
  // Text without terminal punctuation still counts as one sentence
  const sentenceCount = Math.max(1, splitSentences(text).length);
  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);

  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = wordCount > 0 ? syllableCount / wordCount : 0;

  const fleschReadingEase =
    wordCount > 0
      ? Math.max(0, Math.min(100, 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord))
      : 0;
  const fleschKincaidGrade =
    wordCount > 0 ? Math.max(0, 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59) : 0;

  return {
    sentenceCount,
    syllableCount,
    avgWordsPerSentence: round(avgWordsPerSentence, 1),
    avgSyllablesPerWord: round(avgSyllablesPerWord, 2),
    fleschReadingEase: round(fleschReadingEase, 1),
    fleschKincaidGrade: round(fleschKincaidGrade, 1),
    readingLevel: getReadingLevel(fleschReadingEase),
  };
}

/**
 * Convert Flesch Reading Ease score to human-readable level.
 */
export function getReadingLevel(score: number): string {
  if (score >= 90) return "Very Easy (5th grade)";
  if (score >= 80) return "Easy (6th grade)";
  if (score >= 70) return "Fairly Easy (7th grade)";
  if (score >= 60) return "Standard (8th-9th grade)";
  if (score >= 50) return "Fairly Difficult (10th-12th grade)";
  if (score >= 30) return "Difficult (College)";
  return "Very Difficult (College graduate)";
}
