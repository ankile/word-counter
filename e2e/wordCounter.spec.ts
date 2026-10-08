import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { cleanOcrText, countWords } from "../convex/textAnalysis.ts";
import { computeVocabularyStats } from "../convex/vocabulary.ts";
import { EXPECTED_LIBRARY_A } from "./fixtures/library.ts";
import { PAGES } from "./fixtures/pages.ts";
import {
  ACCOUNT_A,
  addTemporaryTrackerBook,
  ACCOUNT_B,
  deleteTrackerBook,
  resetConvex,
  seedLibraries,
  testPassword,
  updateTrackerBook,
} from "./testAccounts.ts";

const PAGE_FILES = PAGES.map((p) => new URL(`fixtures/${p.file}`, import.meta.url).pathname);
const CLEANED_TEXTS = PAGES.map((p) => cleanOcrText(`${p.header}\n${p.body}\n${p.pageNumber}`));
const EXPECTED_WORDS = CLEANED_TEXTS.map(countWords);
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

  await page.locator("input[type=file][multiple]").setInputFiles(PAGE_FILES.slice(0, 2));
  await expect(page.getByText("Done", { exact: true })).toHaveCount(2, { timeout: 90_000 });
  await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();

  const counts = await wordCountsOnPage(page);
  expect(counts).toHaveLength(2);
  counts.forEach((count, i) => expect(Math.abs(count - EXPECTED_WORDS[i])).toBeLessThanOrEqual(WORD_TOLERANCE));

  await expect(page.getByText("Sampling Analysis")).toBeVisible();
  await expect(page.getByText("Estimated total (255 pages)")).toBeVisible();
  // Two pages give a wide t-interval, so the app asks for more rather than claiming confidence
  await expect(page.getByText(/^Add ~\d+ more pages$/)).toBeVisible();
  await expect(page.getByText("High Confidence")).toHaveCount(0);
  await expect(page.getByText("Readability Analysis")).toBeVisible();
  await expect(page.getByText(/^Scan at least 4 pages to estimate the book's vocabulary \(2 so far\)\.$/)).toBeVisible();

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

test("four pages give a unique-word estimate with a growth chart", async ({ page }) => {
  await signIn(page, ACCOUNT_A, EXPECTED_LIBRARY_A.length);
  await page.getByRole("link", { name: /^Foundation/ }).click();
  await page.locator("input[type=file][multiple]").setInputFiles(PAGE_FILES);
  await expect(page.getByText("Done", { exact: true })).toHaveCount(4, { timeout: 90_000 });

  // What the estimator gives on the true text of these pages, extrapolated to Foundation's 255 pages
  const expected = computeVocabularyStats(CLEANED_TEXTS, 255)!.projection!;
  const card = page.locator("div", { has: page.getByRole("heading", { name: "Unique words" }) }).last();
  const shown = Number((await card.getByText(/^≈[\d,]+$/).first().textContent())!.replace(/[^\d]/g, ""));
  // OCR can differ from the source text by a word or two per page
  expect(Math.abs(shown - expected.uniqueWords) / expected.uniqueWords).toBeLessThan(0.05);
  await expect(card.getByText(/^95% range [\d,]+–[\d,]+ across all 255 pages$/)).toBeVisible();

  // Cumulative and marginal charts, the fitted equation, and fit-quality measures
  await expect(card.getByRole("img", { name: /^Unique words so far: fitted over 4 sampled pages and projected to page 255$/ })).toBeVisible();
  await expect(card.getByRole("img", { name: /^New unique words per page: fitted over 4 sampled pages/ })).toBeVisible();
  await expect(card.getByText(/^V\(k\) = [\d.]+ · k/)).toBeVisible();
  for (const measure of ["R² (log-log)", "Residual, RMS / max", "Leave-one-page-out", "Error on 10 novels"]) {
    await expect(card.getByText(measure, { exact: true })).toBeVisible();
  }
  await card.getByText("How is this estimated?").click();
  await expect(card.getByRole("link", { name: /^Heaps' law/ })).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Heaps%27_law");
  await expect(card.getByRole("link", { name: /^Validation on 10 novels/ })).toBeVisible();
  // Each chart has its own page-axis toggle: cumulative defaults to linear, per-page to log
  const cumulativeAxis = card.getByRole("group", { name: "Unique words so far: page axis" });
  const marginalAxis = card.getByRole("group", { name: "New unique words per page: page axis" });
  await expect(cumulativeAxis.getByRole("button", { name: "Linear" })).toHaveAttribute("aria-pressed", "true");
  await expect(marginalAxis.getByRole("button", { name: "Log" })).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByText("Page", { exact: true })).toHaveCount(1);
  await expect(card.getByText("Page (log scale)", { exact: true })).toHaveCount(1);
  await cumulativeAxis.getByRole("button", { name: "Log" }).click();
  await expect(card.getByText("Page (log scale)", { exact: true })).toHaveCount(2);
  await expect(marginalAxis.getByRole("button", { name: "Log" })).toHaveAttribute("aria-pressed", "true");

  await card.getByText("Show data").click();
  await expect(card.getByRole("row")).toHaveCount(1 + 4 + 1); // header, 4 sampled, projected
  await expect(card.getByRole("row").last()).toContainText("255 (projected)");
});

test("changes in Book Tracker show up on the next load", async ({ page }) => {
  // Deletions use throwaway books: see addTemporaryTrackerBook for why fixtures are never deleted
  const unsampledId = await addTemporaryTrackerBook(ACCOUNT_A.uid, "Temporary Unsampled");
  const sampledId = await addTemporaryTrackerBook(ACCOUNT_A.uid, "Temporary Sampled");
  await signIn(page, ACCOUNT_A, EXPECTED_LIBRARY_A.length + 2);

  // A sampled book survives removal from the tracker; an unsampled one disappears
  await page.getByRole("link", { name: /^Temporary Sampled/ }).click();
  await page.locator("input[type=file][multiple]").setInputFiles(PAGE_FILES[0]);
  await expect(page.getByText("Page 1", { exact: true })).toBeVisible();

  await updateTrackerBook(ACCOUNT_A.uid, "e2e-war-and-peace", { title: "War and Peace (Maude translation)" });
  await deleteTrackerBook(ACCOUNT_A.uid, unsampledId);
  await deleteTrackerBook(ACCOUNT_A.uid, sampledId);

  await page.goto("/");
  await expect(page.getByText(`${EXPECTED_LIBRARY_A.length + 1} books`, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^War and Peace \(Maude translation\)\s*Leo Tolstoy/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Temporary Unsampled/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Temporary Sampled/ })).toBeVisible();
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

test("phones scan several pages back to back with the in-app camera", async ({ page, isMobile }) => {
  await signIn(page, ACCOUNT_A, EXPECTED_LIBRARY_A.length);
  await page.getByRole("link", { name: /^Foundation/ }).click();
  const scanButton = page.getByRole("button", { name: "Scan Pages" });
  await expect(page.locator("label", { hasText: "Choose Photos" })).toBeVisible();
  if (!isMobile) {
    await expect(scanButton).toBeHidden();
    return;
  }

  // Stand-in camera: a canvas stream showing whichever fixture page the test puts in front of it
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 1400;
    const context = canvas.getContext("2d")!;
    const image = new Image();
    (window as unknown as { showPage: (src: string) => void }).showPage = (src) => (image.src = src);
    setInterval(() => image.naturalWidth && context.drawImage(image, 0, 0), 50);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: async () => canvas.captureStream(20) },
    });
  });
  const showPage = async (i: number) => {
    const src = `data:image/png;base64,${readFileSync(PAGE_FILES[i]).toString("base64")}`;
    await page.evaluate((s) => (window as unknown as { showPage: (src: string) => void }).showPage(s), src);
    await page.waitForTimeout(300); // let a few frames of the new page through
  };

  await showPage(0);
  await scanButton.click();
  const shutter = page.getByRole("button", { name: "Capture page" });
  await expect(shutter).toBeEnabled();
  await shutter.click();
  await expect(page.getByText(/^1 page/)).toBeVisible();
  await showPage(1);
  await shutter.click();
  await expect(page.getByText("2 pages · all uploaded")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByText("Done", { exact: true })).toHaveCount(2, { timeout: 90_000 });
  const counts = await wordCountsOnPage(page);
  counts.forEach((count, i) => expect(Math.abs(count - EXPECTED_WORDS[i])).toBeLessThanOrEqual(WORD_TOLERANCE));
});
