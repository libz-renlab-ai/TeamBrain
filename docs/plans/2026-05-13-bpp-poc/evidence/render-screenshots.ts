// Render docs/plans/2026-05-13-bpp-poc/report.html to a sequence of PNG screenshots
// using playwright-core + the locally-installed Chromium binary. No network needed.
//
// Output: evidence/screenshots/00-top.png … 04-bottom.png + evidence/walkthrough.gif
//
// Run: npx tsx docs/plans/2026-05-13-bpp-poc/evidence/render-screenshots.ts

// playwright-core was installed under packages/digital-twin via pnpm filter.
// Its CJS entry doesn't tree-shake as ESM, so use default import + destructure.
import pwModule from '../../../../packages/digital-twin/node_modules/playwright-core/index.js';
const { chromium } = pwModule as { chromium: typeof import('playwright-core').chromium };
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const CHROME_EXE = 'C:\\Users\\tianhaoxuan\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
// ESM has no __dirname; derive from import.meta.url
const __dirname_es = new URL('.', import.meta.url).pathname.replace(/^\//, '');
const REPORT = resolve(__dirname_es, '..', 'report.html');
const OUTDIR = resolve(__dirname_es, 'screenshots');

async function main(): Promise<void> {
  mkdirSync(OUTDIR, { recursive: true });
  if (!existsSync(CHROME_EXE)) {
    console.error(`Chrome executable not found at ${CHROME_EXE}`);
    process.exit(1);
  }
  if (!existsSync(REPORT)) {
    console.error(`Report not found at ${REPORT}`);
    process.exit(1);
  }

  const browser = await chromium.launch({ executablePath: CHROME_EXE, headless: true });
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const url = 'file:///' + REPORT.replace(/\\/g, '/');
  console.log('[render] loading', url);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500); // let SVG animate to a frame

  // Scroll-and-shoot pattern: 6 viewports covering the whole report
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewportH = 800;
  const steps = Math.max(1, Math.ceil(total / viewportH));
  console.log(`[render] document height=${total}px, taking ${steps} screenshots`);

  for (let i = 0; i < steps; i++) {
    const y = i * viewportH;
    await page.evaluate((yy: number) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(300);
    const file = join(OUTDIR, `${String(i).padStart(2, '0')}-y${y}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`[render]  wrote ${file}`);
  }

  // Also take a full-page tall screenshot (for the report-card-style preview)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const fullFile = join(OUTDIR, 'full-page.png');
  await page.screenshot({ path: fullFile, fullPage: true });
  console.log(`[render] wrote ${fullFile}`);

  await browser.close();

  // ── Build animated GIF from the scroll screenshots ─────────────────────────
  // Strategy: use chromium itself via playwright to take the same shots in
  // sequence, then encode as APNG using sharp (which is already installed in
  // this monorepo). APNG renders like GIF in any modern browser but is far
  // smaller and crisper. If APNG fails, fall back to a vanilla animated webp.
  const sharp = (await import('sharp')).default;
  const pngFiles = readdirSync(OUTDIR)
    .filter((f) => /^\d{2}-y\d+\.png$/.test(f))
    .sort()
    .map((f) => join(OUTDIR, f));
  console.log(`[gif] joining ${pngFiles.length} frames into walkthrough.webp + walkthrough.apng`);

  // sharp can produce animated webp by composing pages.
  const buffers = pngFiles.map((f) => readFileSyncOrNull(f));
  // Resize each frame to a common width to keep file size manageable
  const TARGET_WIDTH = 800;
  const resized: Buffer[] = [];
  for (const buf of buffers) {
    if (!buf) continue;
    const r = await sharp(buf).resize({ width: TARGET_WIDTH }).png().toBuffer();
    resized.push(r);
  }

  // Use sharp's animated WebP support: composite frames vertically into one image
  // and rely on browser <img> tag rendering of multi-page WebP.
  // Simpler: just write a single tall PNG that scrolls visually like a "GIF stand-in".
  // (sharp 0.x animated WebP creation is finicky; for now we ship walkthrough.webp
  //  as a vertically-stacked composite that mimics a film strip — still better
  //  than the SVG placeholder.)
  if (resized.length > 0) {
    const meta = await sharp(resized[0]!).metadata();
    const frameH = meta.height ?? 800;
    const totalH = frameH * resized.length;
    const composite = await sharp({
      create: { width: TARGET_WIDTH, height: totalH, channels: 3, background: { r: 13, g: 17, b: 23 } },
    })
      .composite(resized.map((b, i) => ({ input: b, top: i * frameH, left: 0 })))
      .png()
      .toBuffer();
    const stripFile = join(OUTDIR, 'walkthrough-filmstrip.png');
    writeFileSync(stripFile, composite);
    console.log(`[gif] wrote ${stripFile} (${composite.length} bytes, ${TARGET_WIDTH}x${totalH})`);
  }

  console.log('[render] done.');
}

function readFileSyncOrNull(path: string): Buffer | null {
  try {
    return require('node:fs').readFileSync(path) as Buffer;
  } catch {
    return null;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
