// Regenerate the page photos: node e2e/fixtures/renderPages.ts
import { chromium } from "@playwright/test";
import { PAGES } from "./pages.ts";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
for (const p of PAGES) {
  const paragraphs = p.body.split("\n").map((line) => `<p>${line}</p>`).join("");
  await page.setContent(`
    <body style="margin:0;background:#f4efe4;font-family:Georgia,serif;color:#1a1a1a">
      <div style="padding:70px 90px;font-size:30px;line-height:1.5">
        <div style="text-align:center;font-size:20px;letter-spacing:3px;margin-bottom:40px">${p.header}</div>
        <div style="text-align:justify">${paragraphs}</div>
        <div style="text-align:center;font-size:22px;margin-top:40px">${p.pageNumber}</div>
      </div>
    </body>`);
  await page.screenshot({ path: new URL(p.file, import.meta.url).pathname, fullPage: true });
}
await browser.close();
