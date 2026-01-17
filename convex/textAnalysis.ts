/**
 * Text analysis utilities for computing readability metrics.
 */

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

  // Count vowel groups
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
 * Split text into sentences using common punctuation.
 */
function splitSentences(text: string): string[] {
  // Split on . ! ? followed by space or end of string
  const sentences = text
    .split(/[.!?]+(?:\s+|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences.length > 0 ? sentences : [text];
}

/**
 * Split text into words.
 */
function splitWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z'-]/g, ""))
    .filter((w) => w.length > 0);
}

export interface ReadabilityMetrics {
  sentenceCount: number;
  wordCount: number;
  syllableCount: number;
  avgWordsPerSentence: number;
  avgSyllablesPerWord: number;
  fleschReadingEase: number; // 0-100, higher = easier
  fleschKincaidGrade: number; // US grade level
  readingLevel: string; // Human-readable description
}

/**
 * Analyze text and compute readability metrics.
 */
export function analyzeText(text: string): ReadabilityMetrics {
  const sentences = splitSentences(text);
  const words = splitWords(text);

  const sentenceCount = sentences.length;
  const wordCount = words.length;
  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);

  // Avoid division by zero
  const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;
  const avgSyllablesPerWord = wordCount > 0 ? syllableCount / wordCount : 0;

  // Flesch Reading Ease
  // 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
  const fleschReadingEase =
    wordCount > 0 && sentenceCount > 0
      ? Math.max(
          0,
          Math.min(
            100,
            206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord
          )
        )
      : 0;

  // Flesch-Kincaid Grade Level
  // 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
  const fleschKincaidGrade =
    wordCount > 0 && sentenceCount > 0
      ? Math.max(
          0,
          0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59
        )
      : 0;

  // Human-readable reading level
  const readingLevel = getReadingLevel(fleschReadingEase);

  return {
    sentenceCount,
    wordCount,
    syllableCount,
    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 100) / 100,
    fleschReadingEase: Math.round(fleschReadingEase * 10) / 10,
    fleschKincaidGrade: Math.round(fleschKincaidGrade * 10) / 10,
    readingLevel,
  };
}

/**
 * Convert Flesch Reading Ease score to human-readable level.
 */
function getReadingLevel(score: number): string {
  if (score >= 90) return "Very Easy (5th grade)";
  if (score >= 80) return "Easy (6th grade)";
  if (score >= 70) return "Fairly Easy (7th grade)";
  if (score >= 60) return "Standard (8th-9th grade)";
  if (score >= 50) return "Fairly Difficult (10th-12th grade)";
  if (score >= 30) return "Difficult (College)";
  return "Very Difficult (College graduate)";
}
