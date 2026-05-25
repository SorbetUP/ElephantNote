import { useEffect } from "react";
import { MarkdownRender } from "@/components/Common/MarkdownRender";
import { createProtectedApiImageResolver } from "@/lib/media/protectedApiImages";
const MARKDOWN = [
  "# E2E: Protected Images",
  "",
  "Markdown image:",
  "",
  "![a.png](/api/file/a.png)",
  "",
  "Second markdown image:",
  "",
  "![b.png](/api/file/a.png)",
  "",
  "Markdown link:",
  "",
  "[a.png](/api/file/a.png)",
].join("\n");

export default function E2EProtectedImagesPage() {
  useEffect(() => {
    const container = document.getElementById("e2e-protected-html");
    if (!container) return;

    const r = createProtectedApiImageResolver();
    r.observe(container);
    return () => r.disconnect();
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1 data-testid="title">E2E Protected Images</h1>

      <section data-testid="markdown">
        <MarkdownRender content={MARKDOWN} />
      </section>

      <section>
        <h2>HTML image (resolver)</h2>
        <div id="e2e-protected-html" data-testid="html">
          <img data-testid="html-img" src="/api/file/a.png" alt="a" />
          <img data-testid="html-img-data-src" data-src="/api/file/a.png" alt="a-data-src" />
        </div>
      </section>
    </div>
  );
}
