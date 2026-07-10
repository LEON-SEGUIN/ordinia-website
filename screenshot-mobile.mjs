import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, "temporary screenshots");

const url = process.argv[2] || "http://localhost:3000";
const label = process.argv[3] || "mobile";
const width = parseInt(process.argv[4] || "390");
const height = parseInt(process.argv[5] || "844");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function nextFilename(label) {
  const files = fs.readdirSync(SCREENSHOTS_DIR).filter((f) => f.endsWith(".png"));
  const nums = files
    .map((f) => parseInt(f.match(/screenshot-(\d+)/)?.[1] ?? "0"))
    .filter((n) => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  const suffix = label ? `-${label}` : "";
  return `screenshot-${next}${suffix}.png`;
}

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({
  width,
  height,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
await page.setUserAgent(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
);
await page.goto(url, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500)); // entrance animations

// Scroll through page to trigger IntersectionObserver-based reveals
const pageHeight = await page.evaluate(() => document.body.scrollHeight);
const step = 500;
for (let y = 0; y < pageHeight; y += step) {
  await page.evaluate((pos) => window.scrollTo(0, pos), y);
  await new Promise((r) => setTimeout(r, 120));
}
await page.evaluate(() => window.scrollTo(0, 0));
await new Promise((r) => setTimeout(r, 800)); // let animations finish

const filename = nextFilename(label);
const filepath = path.join(SCREENSHOTS_DIR, filename);
await page.screenshot({ path: filepath, fullPage: true });
await browser.close();

console.log(`Screenshot saved: temporary screenshots/${filename} (${width}x${height})`);
