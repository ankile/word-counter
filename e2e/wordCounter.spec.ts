import { expect, test, type Page } from "@playwright/test";
import { cleanOcrText, countWords } from "../convex/textAnalysis.ts";
import { EXPECTED_LIBRARY_A } from "./fixtures/library.ts";
import { PAGES } from "./fixtures/pages.ts";
import {
  ACCOUNT_A,
  ACCOUNT_B,
  deleteTrackerBook,
  resetConvex,
  seedLibraries,
  testPassword,
  updateTrackerBook,
} from "./testAccounts.ts";

const PAGE_FILES = PAGES.map((p) => new URL(`fixtures/${p.file}`, import.meta.url).pathname);
const EXPECTED_WORDS = PAGES.map((p) => countWords(cleanOcrText(`${p.header}\n${p.body}\n${p.pageNumber}`)));
// OCR of a clean page is near-exact; allow for a split or merged token
const WORD_TOLERANCE = 2;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.beforeEach(async () => {
  await seedLibraries();
  resetConvex(!!process.env.E2E_BASE_URL);
});

async function signIn(page: Page, account: { email: string }, expectedBooks: number) {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(account.email);
  await page.getByPlaceholder("Password").fill(testPassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your Books" })).toBeVisible();
  // Sync with Book Tracker finished
  await expect(page.getByText(`${expectedBooks} books`, { exact: true })).toBeVisible();
}

const bookRows = (page: Page) => page.getByRole("listitem");

// Per-page word counts, in page order (scoped away from the book-level estimate)
const pageCards = (page: Page) => page.locator("section", { has: page.getByRole("heading", { name: /^Pages/ }) });

async function wordCountsOnPage(page: Page): Promise<number[]> {
  const labels = await pageCards(page).getByText(/^[\d,]+ words$/).allTextContents();
  return labels.map((label) => Number(label.replace(/[^\d]/g, "")));
}

test("wrong password is rejected", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(ACCOUNT_A.email);
  await page.getByPlaceholder("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong email or password")).toBeVisible();
});

test("syncs the Book Tracker library with resolved authors, most recently read first", async ({ page }) => {
  await signIn(page, ACCOUNT_A, EXPECTED_LIBRARY_A.length);
  await expect(bookRows(page)).toHaveText(
    EXPECTED_LIBRARY_A.map(({ title, author }) => new RegExp(`^${escape(title)}${escape(author)}No samples$`))
  );

  await page.getByPlaceholder("Search title or author").fill("austen");
  await expect(bookRows(page)).toHaveText([/^Pride and Prejudice/]);

  await page.getByPlaceholder("Search title or author").fill("");
  await page.getByRole("button", { name: "Unfinished" }).click();
  await expect(bookRows(page)).toHaveText(
    EXPECTED_LIBRARY_A.filter((b) => !b.author.includes("Finished")).map((b) => new RegExp(`^${escape(b.title)}`))
  );

  await page.getByRole("button", { name: "Sampled" }).click();
  await expect(page.getByText("No matching books")).toBeVisible();
});

test("photographed pages are OCR'd into word counts and a book estimate", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await signIn(page, ACCOUNT_A, EXPECTED_LIBRARY_A.length);
  await page.getByRole("link", { name: /^Foundation/ }).click();
  await expect(page.getByRole("heading", { name: "Foundation" })).toBeVisible();

  await page.locator("input[type=file][multiple]").setInputFiles(PAGE_FILES);
  await expect(page.getByText("Done", { exact: true })).toHaveCount(2, { timeout: 90_000 });
  await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();

  const counts = await wordCountsOnPage(page);
  expect(counts).toHaveLength(2);
  counts.forEach((count, i) => expect(Math.abs(count - EXPECTED_WORDS[i])).toBeLessThanOrEqual(WORD_TOLERANCE));

  await expect(page.getByText("Sampling Analysis")).toBeVisible();
  await expect(page.getByText("Estimated total (255 pages)")).toBeVisible();
  await expect(page.getByText("Readability Analysis")).toBeVisible();

  // Re-processing yields the same count
  await page.getByRole("button", { name: "Re-process" }).first().click();
  await expect(page.getByText("Done", { exact: true })).toHaveCount(2, { timeout: 90_000 });
  expect(await wordCountsOnPage(page)).toEqual(counts);

  // The library reflects the samples
  await page.getByRole("link", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Sampled" }).click();
  const avg = Math.round((counts[0] + counts[1]) / 2);
  await expect(bookRows(page)).toHaveText([new RegExp(`^Foundation.*${avg} words/page2/2 pages$`)]);

  // Deleting a page updates the book
  await page.getByRole("link", { name: /^Foundation/ }).click();
  await page.getByRole("button", { name: "Delete" }).last().click();
  await expect(page.getByText("Pages sampled:")).toBeVisible();
  await expect(pageCards(page).getByText(/^[\d,]+ words$/)).toHaveCount(1);
});

test("changes in Book Tracker show up on the next load", async ({ page }) => {
  await signIn(page, ACCOUNT_A, EXPECTED_LIBRARY_A.length);

  // A sampled book survives removal from the tracker; an unsampled one disappears
  await page.getByRole("link", { name: /^Kafka on the Shore/ }).click();
  await page.locator("input[type=file][multiple]").setInputFiles(PAGE_FILES[0]);
  await expect(page.getByText("Page 1", { exact: true })).toBeVisible();

  await updateTrackerBook(ACCOUNT_A.uid, "e2e-war-and-peace", { title: "War and Peace (Maude translation)" });
  await deleteTrackerBook(ACCOUNT_A.uid, "e2e-field-notes");
  await deleteTrackerBook(ACCOUNT_A.uid, "e2e-kafka");

  await page.goto("/");
  await expect(page.getByText("6 books", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^War and Peace \(Maude translation\)\s*Leo Tolstoy/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Field Notes/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Kafka on the Shore/ })).toBeVisible();
});

test("accounts only see their own books", async ({ page }) => {
  await signIn(page, ACCOUNT_A, EXPECTED_LIBRARY_A.length);
  await page.getByRole("link", { name: /^Foundation/ }).click();
  await expect(page.getByRole("heading", { name: "Foundation" })).toBeVisible();
  const foundationUrl = page.url();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Sign in with your Book Tracker account")).toBeVisible();

  await signIn(page, ACCOUNT_B, 1);
  await expect(bookRows(page)).toHaveText([/^Account B Only/]);
  await page.goto(foundationUrl);
  await expect(page.getByText("Book not found")).toBeVisible();
});

test("phones get a camera button that opens the rear camera", async ({ page, isMobile }) => {
  await signIn(page, ACCOUNT_A, EXPECTED_LIBRARY_A.length);
  await page.getByRole("link", { name: /^Foundation/ }).click();
  const takePhoto = page.locator("label", { hasText: "Take Photo" });
  if (isMobile) {
    await expect(takePhoto).toBeVisible();
    await expect(takePhoto.locator("input")).toHaveAttribute("capture", "environment");
  } else {
    await expect(takePhoto).toBeHidden();
  }
  await expect(page.locator("label", { hasText: "Choose Photos" })).toBeVisible();
});
