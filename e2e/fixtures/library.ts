// Synthetic Book Tracker libraries for the e2e accounts. Authors are real catalogAuthors documents
// (public bibliographic data); books deliberately have no workId/editionId so Book Tracker's
// sharing projection never lists the test accounts as readers of a catalog work.

const DAY = 24 * 60 * 60 * 1000;

export const AUTHORS = {
  asimov: "author_6878e13a59cd1d16a505b8d9", // Isaac Asimov
  austen: "author_b28dac671d885ee2a075541a", // Jane Austen
  tolstoy: "author_5f79dee1f127db74c08a0e36", // Leo Tolstoy
  orwell: "author_d014a4cd4d7a8dcd327f0c5a", // George Orwell
  homer: "author_d837f6c8444e29c768c4de89", // Homer
  // "Murakami", merged into "Haruki Murakami"
  murakamiMerged: "author_80cda11a9e63bad07c22c6e1",
};

export interface SeedBook {
  id: string;
  title: string;
  authorIds: string[];
  pageCount: number | null;
  finished: boolean;
  // Days ago; null = never read (ordered by createdAt instead)
  lastReadDaysAgo: number | null;
  createdDaysAgo: number;
}

export const LIBRARY_A: SeedBook[] = [
  { id: "e2e-foundation", title: "Foundation", authorIds: [AUTHORS.asimov], pageCount: 255, finished: false, lastReadDaysAgo: 1, createdDaysAgo: 30 },
  { id: "e2e-war-and-peace", title: "War and Peace", authorIds: [AUTHORS.tolstoy], pageCount: 1225, finished: false, lastReadDaysAgo: null, createdDaysAgo: 3 },
  { id: "e2e-kafka", title: "Kafka on the Shore", authorIds: [AUTHORS.murakamiMerged], pageCount: 480, finished: false, lastReadDaysAgo: 5, createdDaysAgo: 60 },
  { id: "e2e-pride", title: "Pride and Prejudice", authorIds: [AUTHORS.austen], pageCount: 432, finished: true, lastReadDaysAgo: 10, createdDaysAgo: 90 },
  { id: "e2e-anthology", title: "Essays and Stories", authorIds: [AUTHORS.orwell, AUTHORS.asimov], pageCount: null, finished: false, lastReadDaysAgo: 20, createdDaysAgo: 100 },
  { id: "e2e-odyssey", title: "The Odyssey", authorIds: [AUTHORS.homer], pageCount: 541, finished: true, lastReadDaysAgo: 40, createdDaysAgo: 200 },
  { id: "e2e-field-notes", title: "Field Notes", authorIds: [], pageCount: 120, finished: false, lastReadDaysAgo: 50, createdDaysAgo: 300 },
];

export const LIBRARY_B: SeedBook[] = [
  { id: "e2e-b-only", title: "Account B Only", authorIds: [AUTHORS.homer], pageCount: 100, finished: false, lastReadDaysAgo: 2, createdDaysAgo: 10 },
];

/** Expected order and author line in the word-counter library for account A. */
export const EXPECTED_LIBRARY_A = [
  { title: "Foundation", author: "Isaac Asimov" },
  { title: "War and Peace", author: "Leo Tolstoy" },
  { title: "Kafka on the Shore", author: "Haruki Murakami" },
  { title: "Pride and Prejudice", author: "Jane Austen · Finished" },
  { title: "Essays and Stories", author: "George Orwell, Isaac Asimov" },
  { title: "The Odyssey", author: "Homer · Finished" },
  { title: "Field Notes", author: "" },
];

export const daysAgo = (days: number, now: number) => new Date(now - days * DAY);
