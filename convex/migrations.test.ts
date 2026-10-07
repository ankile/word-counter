import { expect, test } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import { backfilledPageFields } from "./migrations";

// A page as stored before origin/ordinary existed
const oldPage = {
  _id: "page1" as Id<"pages">,
  _creationTime: 0,
  bookId: "book1" as Id<"books">,
  imageStorageId: "image1" as Id<"_storage">,
  pageNumber: 3,
  extractedText: "Some words here",
  wordCount: 3,
  status: "done",
  createdAt: 0,
} as unknown as Doc<"pages">;

test("backfill makes existing pages chosen and ordinary and keeps their counts", () => {
  const fields = backfilledPageFields(oldPage);
  expect(fields).toEqual({ origin: "chosen", ordinary: true, countingVersion: 1 });
  const migrated = { ...oldPage, ...fields };
  expect(migrated.wordCount).toBe(3);
  expect(migrated.extractedText).toBe("Some words here");
});

test("backfill is idempotent and leaves later values alone", () => {
  const edited = { ...oldPage, origin: "random", bookPage: 12, ordinary: false, countingVersion: 1 } as Doc<"pages">;
  expect(backfilledPageFields(edited)).toEqual({});
  // Pages without a count get no counting version
  expect(backfilledPageFields({ ...oldPage, status: "error", wordCount: undefined })).toEqual({
    origin: "chosen",
    ordinary: true,
  });
});
