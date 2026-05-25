import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const appDir = path.join(repoRoot, "app");

test("Excalidraw dialog sets EXCALIDRAW_ASSET_PATH before importing module", () => {
  const src = fs.readFileSync(
    path.join(appDir, "src", "components", "Common", "Excalidraw", "ExcalidrawEditorDialog.tsx"),
    "utf8",
  );

  assert.match(src, /EXCALIDRAW_ASSET_PATH/);
  assert.ok(
    src.includes('new URL("/excalidraw-assets/", window.location.origin)'),
    "EXCALIDRAW_ASSET_PATH should be set using an absolute base URL",
  );

  // Ensure the asset path is configured before the lazy import executes.
  const loaderStart = src.indexOf("const loadExcalidrawModule");
  assert.ok(loaderStart >= 0, "missing loadExcalidrawModule loader");
  const loaderChunk = src.slice(loaderStart, loaderStart + 3000);
  assert.ok(
    loaderChunk.indexOf("EXCALIDRAW_ASSET_PATH") < loaderChunk.indexOf('import("@excalidraw/excalidraw")'),
    "EXCALIDRAW_ASSET_PATH should be set before importing @excalidraw/excalidraw",
  );
});

test("index.html does not include inline EXCALIDRAW_ASSET_PATH script", () => {
  const html = fs.readFileSync(path.join(appDir, "index.html"), "utf8");
  assert.ok(!html.includes("EXCALIDRAW_ASSET_PATH"));
});

test("self-hosted Excalidraw font assets exist", () => {
  const fontsDir = path.join(appDir, "public", "excalidraw-assets", "fonts");
  assert.ok(fs.existsSync(fontsDir), "missing app/public/excalidraw-assets/fonts");

  const mustExist = [
    ["Xiaolai", "Xiaolai-Regular-095c169f3314805276f603a362766abd.woff2"],
    ["Virgil", "Virgil-Regular.woff2"],
    ["Excalifont", "Excalifont-Regular-be310b9bcd4f1a43f571c46df7809174.woff2"],
  ];

  for (const [subdir, filename] of mustExist) {
    const p = path.join(fontsDir, subdir, filename);
    assert.ok(fs.existsSync(p), `missing font asset: ${path.relative(repoRoot, p)}`);
  }
});

test("image editor uses overwrite endpoint to avoid duplicate attachments", () => {
  const src = fs.readFileSync(
    path.join(appDir, "src", "components", "Common", "AttachmentRender", "imageRender.tsx"),
    "utf8",
  );
  assert.ok(src.includes("/api/file/overwrite"));
});
