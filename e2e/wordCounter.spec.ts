import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { buildWordEstimatePayload } from "../convex/publish.ts";
import { SLOT_BATCH } from "../convex/sampling.ts";
import { computeBookEstimate, MIN_RANDOM_PAGES, type EstimatePage } from "../convex/stats.ts";
import { cleanOcrText, countWords } from "../convex/textAnalysis.ts";
import { computeVocabularyStats } from "../convex/vocabulary.ts";
import { EXPECTED_LIBRARY_A } from "./fixtures/library.ts";
import { BLANK_PAGE, PAGES } from "./fixtures/pages.ts";
import {
  ACCOUNT_A,
  addTemporaryTrackerBook,
  ACCOUNT_B,
  callBookTrackerAs,
  deleteTrackerBook,
  resetConvex,
  seedLibraries,
  testPassword,
  updateTrackerBook,
} from "./testAccounts.ts";

const PAGE_FILES = PAGES.map((p) => new URL(`fixtures/${p.file}`, import.meta.url).pathname);
const BLANK_FILE = new URL(`fixtures/${BLANK_PAGE.file}`, import.meta.url).pathname;
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
  // Not a real account: failed attempts on the shared test accounts make Firebase lock them (auth/too-many-requests)
  await page.getByPlaceholder("Email").fill("word-counter-e2e-nobody@example.com");
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

  await expect(page.getByText("Words per page", { exact: true })).toBeVisible();
  await expect(page.getByText("Estimated total (255 pages)")).toBeVisible();
  // Hand-picked pages alone read high, so the app flags them and asks for random pages instead of claiming precision
  await expect(page.getByText("Hand-picked pages only")).toBeVisible();
  const chosenOnly = computeBookEstimate(
    counts.map((wordCount) => ({ origin: "chosen", ordinary: true, wordCount })),
    255
  )!;
  expect(chosenOnly.randomPagesForSendable).toBeGreaterThanOrEqual(MIN_RANDOM_PAGES);
  await expect(
    page.getByText(
      `Random pages: ${chosenOnly.randomPagesForSendable} pages more to send, ${chosenOnly.randomPagesForRecommended} for the recommended ±10%`,
      { exact: true }
    )
  ).toBeVisible();
  // Vision detects English on these pages, so Flesch scores apply
  await expect(page.getByText("Readability Analysis")).toBeVisible();
  await expect(page.getByText("Scan at least 4 pages containing text to estimate vocabulary (2 so far).", { exact: true })).toBeVisible();

  // Invalid printed numbers never persist; valid numbers and clearing survive a reload.
  const printedPage = page.getByLabel("Printed page").first();
  for (const invalid of ["-5", "1.5", "256"]) {
    await printedPage.fill(invalid);
    await printedPage.press("Tab");
    await expect(printedPage).toHaveAttribute("aria-invalid", "true");
    await expect(pageCards(page).getByRole("alert")).toContainText("Enter a whole page number from 1 to 255");
  }
  await page.reload();
  await expect(page.getByLabel("Printed page").first()).toHaveValue("");
  await page.getByLabel("Printed page").first().fill("5");
  await page.getByLabel("Printed page").first().press("Tab");
  await expect(pageCards(page).getByRole("status")).toHaveText("Printed page saved");
  await page.reload();
  await expect(page.getByLabel("Printed page").first()).toHaveValue("5");
  await page.getByLabel("Printed page").first().fill("");
  await page.getByLabel("Printed page").first().press("Tab");
  await expect(pageCards(page).getByRole("status")).toHaveText("Printed page saved");
  await page.reload();
  await expect(page.getByLabel("Printed page").first()).toHaveValue("");

  // The original photo opens with the keyboard; modal focus stays inside and returns on Escape.
  const thumbnail = page.getByRole("button", { name: "View page 1 photo" });
  await expect(thumbnail.locator("img")).toHaveAttribute("loading", "lazy");
  await expect(thumbnail.locator("img")).toHaveAttribute("src", /^\/_next\/image\?/);
  await thumbnail.focus();
  await thumbnail.press("Enter");
  const photo = page.getByRole("dialog", { name: "Page photo" });
  await expect(photo).toBeVisible();
  await expect(photo.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(await photo.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(photo).toBeHidden();
  await expect(thumbnail).toBeFocused();

  // Re-processing yields the same count
  await page.getByRole("button", { name: "Re-process" }).first().click();
  await expect(page.getByText("Done", { exact: true })).toHaveCount(2, { timeout: 90_000 });
  expect(await wordCountsOnPage(page)).toEqual(counts);

  // The library reflects the samples
  await page.getByRole("link", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Sampled" }).click();
  const avg = Math.round((counts[0] + counts[1]) / 2);
  await expect(bookRows(page)).toHaveText([new RegExp(`^Foundation.*${avg} words/pageSample · 2/2 pages$`)]);

  // Deleting a page updates the book
  await page.getByRole("link", { name: /^Foundation/ }).click();
  await page.getByRole("button", { name: "Delete" }).last().click();
  await expect(page.getByText("Pages sampled:")).toBeVisible();
  await expect(pageCards(page).getByText(/^[\d,]+ words$/)).toHaveCount(1);
});

test("random pages, blank ones included, correct the hand-picked estimate", async ({ page }) => {
  await signIn(page, ACCOUNT_A, EXPECTED_LIBRARY_A.length);
  await page.getByRole("link", { name: /^Foundation/ }).click();
  const randomCard = page.getByRole("region", { name: "Random pages" });
  const slots = randomCard.getByText(/^Photograph page \d+$/);
  // With nothing counted yet, the minimum random sample is suggested
  await expect(slots).toHaveCount(MIN_RANDOM_PAGES);
  // The synthetic books aren't linked to a catalog edition, so nothing can be sent
  await expect(page.getByRole("button", { name: "Send to Book Tracker" })).toBeDisabled();
  await expect(page.getByText("Link this book to the catalog in Book Tracker first")).toBeVisible();

  await page.locator("input[type=file][multiple]").setInputFiles(PAGE_FILES.slice(0, 3));
  // Fill four slots: three pages of text and a blank page, which must be photographed rather than skipped
  const slotPages = (await slots.allTextContents()).slice(0, 4).map((text) => Number(text.replace(/\D/g, "")));
  const slotFiles = [PAGE_FILES[3], PAGE_FILES[0], PAGE_FILES[1], BLANK_FILE];
  for (const [i, slot] of slotPages.entries()) {
    await randomCard.getByLabel(`Photo of page ${slot}`, { exact: true }).setInputFiles(slotFiles[i]);
    await expect(randomCard.getByText(`Photograph page ${slot}`, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText("Done", { exact: true })).toHaveCount(7, { timeout: 90_000 });

  const blank = page.getByRole("article").filter({ hasText: new RegExp(`Random · p\\. ${slotPages[3]}(?!\\d)`) });
  await expect(blank.getByText("0 words", { exact: true })).toBeVisible();
  // Nobody unticks it: a page this far under the book's typical page counts as not ordinary on its own
  await expect(blank.getByText(/not ordinary/)).toBeVisible();
  await expect(blank.getByText(/^Automatic: short page, under [\d,]+ words$/)).toBeVisible();
  await expect(blank.getByLabel("Ordinary page of text")).not.toBeChecked();
  // The reader can overrule the rule and hand the page back to it
  await blank.getByLabel("Ordinary page of text").check();
  await expect(blank.getByText(/not ordinary/)).toHaveCount(0);
  await blank.getByRole("button", { name: "Back to automatic" }).click();
  await expect(blank.getByText(/not ordinary/)).toBeVisible();
  await expect(blank.getByRole("button", { name: "Back to automatic" })).toHaveCount(0);

  // The app shows the stratified estimate on the counts it OCR'd. Uploads run concurrently, so a random page can
  // be numbered before the hand-picked ones: read each card's origin and ordinary flag from the card itself
  const sampled: EstimatePage[] = await Promise.all(
    (await pageCards(page).getByRole("article").all()).map(async (card) => {
      const text = await card.innerText();
      return {
        origin: /Random · p\./.test(text) ? "random" : "chosen",
        ordinary: !/not ordinary/.test(text),
        wordCount: Number(text.match(/([\d,]+) words/)![1].replace(/,/g, "")),
      };
    })
  );
  expect(sampled.filter((p) => p.origin === "chosen")).toHaveLength(3);
  expect(sampled.filter((p) => !p.ordinary)).toEqual([{ origin: "random", ordinary: false, wordCount: 0 }]);
  const expected = computeBookEstimate(sampled, 255)!;
  expect(expected.method).toBe("corrected-chosen");
  // The blank page pulls the estimate below the hand-picked pages' mean
  const chosenOnly = computeBookEstimate(sampled.filter((p) => p.origin === "chosen"), 255)!;
  expect(expected.wordsPerPage).toBeLessThan(chosenOnly.wordsPerPage);
  const estimateCard = page.getByRole("region", { name: "Words per page" });
  await expect(estimateCard.getByText("3 hand-picked, 4 random pages")).toBeVisible();
  await expect(estimateCard.getByText("Not sendable yet")).toBeVisible();
  await expect(estimateCard.getByText(expected.wordsPerPage.toLocaleString("en-US"), { exact: true })).toBeVisible();
  await expect(estimateCard.getByText("75%", { exact: true })).toBeVisible();
  await expect(
    estimateCard.getByText(
      `Random pages: ${expected.randomPagesForSendable} pages more to send, ${expected.randomPagesForRecommended} for the recommended ±10%`
    )
  ).toBeVisible();
  await expect(estimateCard.getByText(`${expected.totalWords!.toLocaleString("en-US")} words`)).toBeVisible();
  // Open slots are topped up toward what the ±10% target needs, one batch at a time
  expect(expected.randomPagesForRecommended).toBeGreaterThan(SLOT_BATCH);
  await expect(slots).toHaveCount(SLOT_BATCH);
});

test("bad photos recover without losing good uploads or blocking random slots", async ({ page, isMobile }) => {
  await signIn(page, ACCOUNT_A, EXPECTED_LIBRARY_A.length);
  await page.getByRole("link", { name: /^Foundation/ }).click();

  // Both the main chooser and random-slot picker can be reached from the keyboard.
  const chooser = page.getByRole("button", { name: "Choose Photos" });
  await chooser.focus();
  const fileChooser = page.waitForEvent("filechooser");
  await chooser.press("Enter");
  await (await fileChooser).setFiles([
    { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image") },
    { name: "good.png", mimeType: "image/png", buffer: readFileSync(PAGE_FILES[0]) },
  ]);
  await expect(page.locator("main").getByRole("alert")).toContainText("broken.png: This photo could not be read");
  await expect(chooser).toBeEnabled();
  await expect(page.getByText("Done", { exact: true })).toHaveCount(1, { timeout: 90_000 });
  await page.getByRole("button", { name: "Retry failed photos" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("broken.png");
  await expect(page.getByRole("article")).toHaveCount(1);

  await page.getByLabel("Page photos", { exact: true }).setInputFiles({
    name: "unreadable.heic", mimeType: "image/heic", buffer: Buffer.from("not an image"),
  });
  await expect(page.locator("main").getByRole("alert")).toContainText("Export the photo as JPG or PNG");
  await expect(page.getByRole("button", { name: "Retry failed photos" })).toBeEnabled();

  const randomCard = page.getByRole("region", { name: "Random pages" });
  const picker = randomCard.locator("input[type=file]").first();
  if (isMobile) {
    // Mobile Safari's default Tab order skips non-text controls; external keyboard users can enable all controls.
    await picker.focus();
  } else {
    await randomCard.getByRole("button", { name: "Can't photograph it" }).first().focus();
    await page.keyboard.press("Shift+Tab");
  }
  await expect(picker).toBeFocused();
  await picker.setInputFiles({ name: "broken-slot.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(randomCard.getByRole("alert")).toContainText("broken-slot.png");
  await expect(picker).toBeVisible();
  await expect(randomCard.getByText("Uploading...", { exact: true })).toHaveCount(0);
  await picker.setInputFiles(PAGE_FILES[1]);
  await expect(page.getByText("Done", { exact: true })).toHaveCount(2, { timeout: 90_000 });
  await expect(randomCard.getByRole("alert")).toHaveCount(0);
});

test("blank scans keep their counts without producing a false book or vocabulary estimate", async ({ page }) => {
  await signIn(page, ACCOUNT_A, EXPECTED_LIBRARY_A.length);
  await page.getByRole("link", { name: /^Foundation/ }).click();
  await page.getByLabel("Page photos", { exact: true }).setInputFiles([BLANK_FILE, BLANK_FILE, BLANK_FILE, BLANK_FILE]);
  await expect(page.getByText("Done", { exact: true })).toHaveCount(4, { timeout: 90_000 });
  await expect(page.getByText("0 words", { exact: true })).toHaveCount(4);
  await expect(page.getByText(/No words were detected in these scans/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Words per page" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: /^Unique words so far/ })).toHaveCount(0);
  await expect(page.getByText(/Add the book's page count/)).toHaveCount(0);
  expect(await page.locator("main").innerText()).not.toContain("NaN");
});

test("four pages give a unique-word estimate with a growth chart", async ({ page }, testInfo) => {
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
  await expect(card.getByRole("img", { name: /^Unique words so far: fitted over 4 sampled pages and projected to 255 sampled-page equivalents$/ })).toBeVisible();
  await expect(card.getByRole("img", { name: /^New unique words per page: fitted over 4 sampled pages/ })).toBeVisible();
  await expect(card.getByText(/^V\(k\) = [\d.]+ · k/)).toBeHidden();
  await card.getByText("Model diagnostics", { exact: true }).click();
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
  await expect(card.getByText("Sampled-page equivalents", { exact: true })).toHaveCount(1);
  await expect(card.getByText("Sampled-page equivalents (log scale)", { exact: true })).toHaveCount(1);
  await cumulativeAxis.getByRole("button", { name: "Log" }).click();
  await expect(card.getByText("Sampled-page equivalents (log scale)", { exact: true })).toHaveCount(2);
  await expect(marginalAxis.getByRole("button", { name: "Log" })).toHaveAttribute("aria-pressed", "true");
  await marginalAxis.getByRole("button", { name: "Linear" }).click();
  await expect(cumulativeAxis.getByRole("button", { name: "Log" })).toHaveAttribute("aria-pressed", "true");
  await cumulativeAxis.getByRole("button", { name: "Linear" }).click();
  await marginalAxis.getByRole("button", { name: "Log" }).click();

  // Sample detail expands the observed points without changing either plot's scale or the other plot's domain.
  await card.getByRole("button", { name: "Sample detail", exact: true }).first().click();
  const cumulativePlot = card.getByRole("img", { name: "Unique words so far: fitted over 4 sampled pages", exact: true });
  const marginalPlot = card.getByRole("img", { name: /^New unique words per page:.*projected/ });
  await expect(cumulativePlot).toBeVisible();
  await expect(marginalPlot).toBeVisible();
  await expect(cumulativeAxis.getByRole("button", { name: "Linear" })).toHaveAttribute("aria-pressed", "true");
  await expect(marginalAxis.getByRole("button", { name: "Log" })).toHaveAttribute("aria-pressed", "true");
  const positions = await cumulativePlot.locator("circle").evaluateAll((circles) => circles.map((circle) => Number(circle.getAttribute("cx"))));
  const plotWidth = await cumulativePlot.evaluate((svg) => svg.getBoundingClientRect().width);
  expect(positions.at(-1)! - positions[0]).toBeGreaterThan(plotWidth / 2);
  await expect(cumulativePlot).toHaveCSS("touch-action", "pan-y");
  await cumulativePlot.focus();
  await cumulativePlot.press("End");
  await expect(card.getByRole("status").first()).toContainText("4 sampled pages");
  await cumulativePlot.press("ArrowLeft");
  await expect(card.getByRole("status").first()).toContainText("3 sampled pages");
  await cumulativePlot.press("Escape");
  await expect(card.getByRole("status")).toHaveCount(0);
  await card.getByRole("button", { name: "Whole book", exact: true }).click();
  await card.getByText("Model diagnostics", { exact: true }).click();
  await card.getByText("How is this estimated?", { exact: true }).click();
  await card.screenshot({ path: testInfo.outputPath("vocabulary-charts.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

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

test("Book Tracker accepts the estimate's shape but refuses a book not linked to the edition", async ({ isMobile }) => {
  test.skip(isMobile, "A server call, the same from every device");
  // A sendable estimate in exactly the form "Send to Book Tracker" sends, for a synthetic book. The synthetic books
  // are never linked to a catalog edition, so the server must refuse it (failed-precondition) without writing.
  const words = (n: number) => Array.from({ length: n }, (_, i) => 300 + (i % 2 === 0 ? 10 : -10));
  const estimate = computeBookEstimate(
    [
      ...words(6).map((wordCount) => ({ origin: "random" as const, ordinary: true, wordCount })),
      ...words(2).map((wordCount) => ({ origin: "random" as const, ordinary: false, wordCount })),
    ],
    255
  )!;
  const payload = buildWordEstimatePayload({
    trackerBookId: "e2e-foundation",
    editionId: "word-counter-e2e-unlinked-edition",
    totalPages: 255,
    estimate,
    randomPages: estimate.randomPages,
    stalePages: 0,
    openGrowthSlots: 0,
    language: "en",
    readability: { fleschKincaidGrade: 6.4, fleschReadingEase: 79.9, avgWordsPerSentence: 17.4, avgSyllablesPerWord: 1.29, readingLevel: "Fairly Easy (7th grade)" },
    vocabulary: null,
  })!;
  // An invalid-argument refusal here would mean the contract drifted: the decoder runs before the ownership checks
  const { status, json } = await callBookTrackerAs(ACCOUNT_A.email, "catalog-setwordestimate", payload);
  expect(json).toEqual({
    error: { status: "FAILED_PRECONDITION", message: "That book is not linked to this edition in Book Tracker." },
  });
  expect(status).toBe(400);
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
  await expect(page.getByRole("button", { name: "Choose Photos" })).toBeVisible();
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

  // Scanning random pages asks for each suggested page by number
  const randomCard = page.getByRole("region", { name: "Random pages" });
  const firstSlot = (await randomCard.getByText(/^Photograph page \d+$/).first().textContent())!;
  await randomCard.getByRole("button", { name: "Scan these pages" }).click();
  await expect(page.getByRole("dialog", { name: "Scan pages" }).getByText(firstSlot, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
});
