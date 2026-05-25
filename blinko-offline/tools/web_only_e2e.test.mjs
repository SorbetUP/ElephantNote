import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawn } from "node:child_process";
import net from "node:net";
import { chromium } from "playwright";

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHttpOk(url, { timeoutMs = 30_000 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${url}`);
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status >= 200 && res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe("web-only e2e (Playwright)", () => {
  let port;
  let server;
  let browser;

  beforeAll(async () => {
    port = await getFreePort();
    server = spawn("bunx", ["vite", "--host", "127.0.0.1", "--port", String(port)], {
      cwd: new URL("../app", import.meta.url).pathname,
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "development" },
    });

    await waitForHttpOk(`http://127.0.0.1:${port}/`);
    browser = await chromium.launch({ headless: true });
  }, 60_000);

  afterAll(async () => {
    try {
      await browser?.close();
    } catch {}
    try {
      server?.kill("SIGTERM");
    } catch {}
  });

  test(
    "runs without Tauri runtime and supports URL routing + back/forward navigation",
    async () => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      try {
        window.localStorage.setItem("i18nextLng", "en");
      } catch {}
    });
    const page = await ctx.newPage();

    const base = `http://127.0.0.1:${port}`;
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Vite dev + app boot can cause a fast follow-up navigation; give it a moment to settle.
    await page.waitForLoadState("networkidle").catch(() => {});

    // Web-only: Tauri runtime marker must not exist.
    let hasTauri;
    for (let i = 0; i < 3; i++) {
      try {
        hasTauri = await page.evaluate(() => typeof window !== "undefined" && window.__TAURI__ !== undefined);
        break;
      } catch (e) {
        const msg = String(e || "");
        if (!msg.includes("Execution context was destroyed")) throw e;
        await page.waitForTimeout(250);
      }
    }
    expect(hasTauri).toBe(false);

    // Deep link routing: oauth callback should render without auth.
    await page.goto(`${base}/oauth-callback?error=boom`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("text=Login failed", { timeout: 30_000 });

    // History navigation works in browser.
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 30_000 });
    expect(page.url().startsWith(`${base}/`)).toBe(true);
    expect(page.url()).not.toContain("/oauth-callback");

    await page.goForward({ waitUntil: "domcontentloaded", timeout: 30_000 });
    expect(page.url()).toContain("/oauth-callback");

    await ctx.close();
  },
    60_000,
  );

  test(
    "renders protected /api images via blob object URLs (no auth headers needed on <img>)",
    async () => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();

      // Serve a tiny PNG for any request to /api/file/a.png (both <img> and axios fetch).
      const pngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X+0wAAAABJRU5ErkJggg==";
      const body = Buffer.from(pngBase64, "base64");

      await page.route("**/api/file/a.png", async (route) => {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "image/png" },
          body,
        });
      });

      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));

      const base = `http://127.0.0.1:${port}`;
      await page.goto(`${base}/__e2e__/protected-images`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForSelector('[data-testid="title"]', { timeout: 30_000 });

      // MarkdownRender (ImageWrapper) should resolve to a blob URL.
      const mdImgSrc = await page.locator('[data-testid="markdown"] img').first().getAttribute("src");
      expect(mdImgSrc).toMatch(/^blob:/);

      // Clicking a markdown image should open our dialog (not the react-photo-view overlay).
      await page.locator('[data-testid="markdown"] img').first().click({ force: true });
      await page.waitForSelector('[data-testid="image-preview-dialog"]', { timeout: 30_000 });
      await page.waitForSelector('[data-testid="image-preview-edit"]', { timeout: 30_000 });
      // Close it via Escape (HeroUI Modal).
      await page.keyboard.press("Escape");
      await page.waitForSelector('[data-testid="image-preview-dialog"]', { state: "detached", timeout: 30_000 });

      // The HTML resolver should also rewrite to blob.
      const htmlImgSrc = await page.locator('[data-testid="html-img"]').getAttribute("src");
      expect(htmlImgSrc).toMatch(/^blob:/);

      // data-src should be supported too (Vditor lazy load style).
      const htmlImgDataSrc = await page.locator('[data-testid="html-img-data-src"]').getAttribute("src");
      expect(htmlImgDataSrc).toMatch(/^blob:/);
      const remainingDataSrc = await page.locator('[data-testid="html-img-data-src"]').getAttribute("data-src");
      expect(remainingDataSrc).toBeNull();

      expect(errors).toEqual([]);

      await ctx.close();
    },
    60_000,
  );
});
