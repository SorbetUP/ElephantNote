use std::collections::HashMap;

use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use std::sync::Arc;

use super::LocalApiContext;

pub async fn share_page(
    State(_state): State<Arc<LocalApiContext>>,
    Path(share_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    if share_id.trim().is_empty() {
        return StatusCode::NOT_FOUND.into_response();
    }

    let password_hint = query.get("password").cloned().unwrap_or_default();
    let html = render_share_html(&share_id, &password_hint);

    let mut resp = Response::new(html.into());
    *resp.status_mut() = StatusCode::OK;
    let headers = resp.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/html; charset=utf-8"),
    );
    // This is a per-note page that can be revoked; keep caching conservative.
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-store, max-age=0"),
    );
    resp
}

fn render_share_html(share_id: &str, password_hint: &str) -> String {
    // Minimal standalone share page that can be opened in a regular browser while the app is
    // running. It fetches note data via the local tRPC endpoint and renders raw markdown.
    //
    // Keep it dependency-free (no external CDNs) so it works offline.
    let share_id_js = js_string(share_id);
    let password_hint_js = js_string(password_hint);

    let template = r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shared note</title>
    <style>
      :root {{
        color-scheme: dark;
        --bg0: #070a10;
        --bg1: #0b1020;
        --card: rgba(255, 255, 255, 0.06);
        --card2: rgba(255, 255, 255, 0.08);
        --stroke: rgba(255, 255, 255, 0.12);
        --stroke2: rgba(255, 255, 255, 0.18);
        --text: rgba(235, 242, 255, 0.92);
        --muted: rgba(235, 242, 255, 0.72);
        --faint: rgba(235, 242, 255, 0.55);
        --brand: #6ee7ff;
        --brand2: #8b5cf6;
        --danger: #ff7b72;
        --shadow: 0 24px 70px rgba(0,0,0,0.55);
      }}

      * {{ box-sizing: border-box; }}

      body {{
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        line-height: 1.45;
        background:
          radial-gradient(1200px 700px at 20% -10%, rgba(110,231,255,0.18), transparent 60%),
          radial-gradient(900px 700px at 90% 10%, rgba(139,92,246,0.16), transparent 55%),
          radial-gradient(800px 600px at 40% 110%, rgba(34,197,94,0.08), transparent 55%),
          linear-gradient(180deg, var(--bg0), var(--bg1));
        color: var(--text);
        min-height: 100vh;
      }}

      .noise {{
        position: fixed;
        inset: 0;
        pointer-events: none;
        background:
          repeating-linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.03) 1px, transparent 1px, transparent 6px);
        mix-blend-mode: overlay;
        opacity: 0.10;
      }}

      .wrap {{
        max-width: 920px;
        margin: 0 auto;
        padding: 28px 16px 60px;
      }}

      .topbar {{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 14px;
      }}

      .brand {{
        display: flex;
        align-items: center;
        gap: 10px;
        letter-spacing: 0.2px;
      }}
      .logo {{
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background:
          radial-gradient(18px 18px at 30% 30%, rgba(110,231,255,0.85), transparent 60%),
          radial-gradient(22px 22px at 70% 70%, rgba(139,92,246,0.75), transparent 60%),
          linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02));
        border: 1px solid rgba(255,255,255,0.14);
        box-shadow: 0 12px 30px rgba(0,0,0,0.45);
      }}
      .brand h1 {{
        font-size: 14px;
        margin: 0;
        color: var(--muted);
        font-weight: 700;
      }}
      .brand .id {{
        font-size: 12px;
        color: var(--faint);
        margin-top: 2px;
      }}

      .actions {{
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }}

      .btn {{
        border: 1px solid var(--stroke);
        background: rgba(255,255,255,0.06);
        color: var(--muted);
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
        user-select: none;
      }}
      .btn:hover {{
        transform: translateY(-1px);
        border-color: var(--stroke2);
        background: rgba(255,255,255,0.08);
      }}
      .btn.primary {{
        border-color: rgba(110,231,255,0.30);
        background: linear-gradient(135deg, rgba(110,231,255,0.16), rgba(139,92,246,0.14));
        color: rgba(235,242,255,0.92);
      }}

      .card {{
        background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.04));
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 18px;
        padding: 18px 18px 16px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(14px);
      }}

      .title {{
        margin: 0;
        font-size: 22px;
        line-height: 1.15;
        letter-spacing: 0.2px;
      }}
      .subtitle {{
        margin: 8px 0 0;
        color: var(--faint);
        font-size: 13px;
      }}

      .meta {{
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin: 14px 0 14px;
      }}
      .pill {{
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        color: var(--muted);
        background: rgba(0,0,0,0.16);
      }}
      .pill strong {{
        color: var(--text);
      }}

      .divider {{
        height: 1px;
        background: rgba(255,255,255,0.10);
        margin: 12px 0 14px;
      }}

      .loading {{
        display: block;
      }}
      .skeleton {{
        border-radius: 12px;
        background: linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.10), rgba(255,255,255,0.06));
        background-size: 220% 100%;
        animation: shimmer 1.2s ease-in-out infinite;
      }}
      @keyframes shimmer {{
        0% {{ background-position: 120% 0; }}
        100% {{ background-position: -120% 0; }}
      }}
      .sk-line {{ height: 12px; margin: 10px 0; }}
      .sk-line.w1 {{ width: 86%; }}
      .sk-line.w2 {{ width: 72%; }}
      .sk-line.w3 {{ width: 64%; }}
      .sk-line.w4 {{ width: 92%; }}

      .error {{
        margin-top: 12px;
        color: var(--danger);
        font-size: 13px;
        display: none;
      }}

      .pw {{
        margin-top: 14px;
        display: none;
        padding: 14px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.18);
      }}
      .pw .row {{
        display: flex;
        gap: 10px;
        align-items: center;
        margin-top: 10px;
      }}
      .pw input {{
        flex: 1;
        padding: 12px 12px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.18);
        background: rgba(0,0,0,0.22);
        color: var(--text);
        font-size: 14px;
        outline: none;
      }}
      .pw input:focus {{
        border-color: rgba(110,231,255,0.30);
        box-shadow: 0 0 0 3px rgba(110,231,255,0.10);
      }}

      .content {{
        display: none;
      }}

      .prose {{
        color: var(--text);
        font-size: 15px;
      }}
      .prose p {{
        margin: 10px 0;
        color: rgba(235,242,255,0.88);
      }}
      .prose a {{
        color: rgba(110,231,255,0.90);
        text-decoration: none;
        border-bottom: 1px solid rgba(110,231,255,0.30);
      }}
      .prose a:hover {{
        border-bottom-color: rgba(110,231,255,0.70);
      }}
      .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {{
        margin: 18px 0 10px;
        line-height: 1.2;
      }}
      .prose h1 {{ font-size: 20px; }}
      .prose h2 {{ font-size: 18px; }}
      .prose h3 {{ font-size: 16px; color: rgba(235,242,255,0.92); }}
      .prose ul, .prose ol {{
        margin: 10px 0 10px 18px;
        padding: 0;
        color: rgba(235,242,255,0.86);
      }}
      .prose li {{ margin: 6px 0; }}
      .prose blockquote {{
        margin: 12px 0;
        padding: 10px 12px;
        border-left: 3px solid rgba(110,231,255,0.35);
        background: rgba(0,0,0,0.18);
        border-radius: 10px;
        color: rgba(235,242,255,0.82);
      }}
      .prose code {{
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 13px;
        background: rgba(0,0,0,0.25);
        border: 1px solid rgba(255,255,255,0.10);
        padding: 2px 6px;
        border-radius: 8px;
      }}
      .prose pre {{
        overflow: auto;
        margin: 12px 0;
        padding: 12px;
        border-radius: 14px;
        background: rgba(0,0,0,0.28);
        border: 1px solid rgba(255,255,255,0.10);
      }}
      .prose pre code {{
        background: transparent;
        border: none;
        padding: 0;
        display: block;
        white-space: pre;
      }}
      .prose img {{
        max-width: 100%;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.10);
        box-shadow: 0 18px 60px rgba(0,0,0,0.35);
        margin: 10px 0;
      }}
      .hr {{
        height: 1px;
        background: rgba(255,255,255,0.10);
        margin: 14px 0;
      }}

      .attachments {{
        margin-top: 16px;
      }}
      .attachments h2 {{
        margin: 0 0 10px;
        font-size: 13px;
        color: var(--muted);
        letter-spacing: 0.2px;
        text-transform: uppercase;
      }}
      .att-grid {{
        display: grid;
        grid-template-columns: repeat(12, 1fr);
        gap: 10px;
      }}
      .att {{
        grid-column: span 6;
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 10px 10px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.18);
      }}
      .att .ico {{
        width: 36px;
        height: 36px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.12);
        background: linear-gradient(135deg, rgba(110,231,255,0.14), rgba(139,92,246,0.12));
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(235,242,255,0.90);
        font-weight: 900;
      }}
      .att .meta {{
        margin: 0;
        display: block;
      }}
      .att .name {{
        font-size: 13px;
        color: rgba(235,242,255,0.92);
        font-weight: 750;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
      }}
      .att .hint {{
        margin-top: 2px;
        font-size: 12px;
        color: rgba(235,242,255,0.60);
      }}
      .att a {{
        color: inherit;
        text-decoration: none;
      }}
      .att:hover {{
        border-color: rgba(255,255,255,0.18);
        background: rgba(0,0,0,0.22);
      }}

      @media (max-width: 640px) {{
        .att {{ grid-column: span 12; }}
        .wrap {{ padding: 22px 12px 50px; }}
        .title {{ font-size: 20px; }}
      }}
    </style>
  </head>
  <body>
    <div class="noise"></div>
    <div class="wrap">
      <div class="topbar">
        <div class="brand">
          <div class="logo" aria-hidden="true"></div>
          <div>
            <h1>Blinko Share</h1>
            <div class="id">Share ID: <span id="shareIdText"></span></div>
          </div>
        </div>
        <div class="actions">
          <button id="copyBtn" class="btn">Copy link</button>
          <button id="downloadBtn" class="btn">Download .md</button>
          <button id="refreshBtn" class="btn primary">Refresh</button>
        </div>
      </div>

      <div class="card">
        <h2 id="title" class="title">Shared note</h2>
        <div id="subtitle" class="subtitle" style="display:none"></div>
        <div id="meta" class="meta" style="display:none"></div>

        <div id="loading" class="loading">
          <div class="divider"></div>
          <div class="skeleton sk-line w1"></div>
          <div class="skeleton sk-line w4"></div>
          <div class="skeleton sk-line w2"></div>
          <div class="skeleton sk-line w3"></div>
        </div>

        <div id="pw" class="pw">
          <div style="color: rgba(235,242,255,0.82); font-size: 13px; font-weight: 700;">Password required</div>
          <div style="color: rgba(235,242,255,0.60); font-size: 12px; margin-top: 4px;">Enter the password to view this note.</div>
          <div class="row">
            <input id="pwInput" placeholder="Password" inputmode="text" maxlength="128" autocomplete="off" />
            <button id="pwBtn" class="btn primary">Open</button>
          </div>
        </div>

        <div id="error" class="error"></div>

        <div id="contentWrap" class="content">
          <div class="divider"></div>
          <article id="content" class="prose"></article>
          <div id="attachmentsWrap" class="attachments" style="display:none">
            <h2>Attachments</h2>
            <div id="attachments" class="att-grid"></div>
          </div>
        </div>
      </div>
    </div>

    <script>
      const shareId = __BLINKO_SHARE_ID__;
      let password = __BLINKO_PASSWORD_HINT__ || '';

      const elShareIdText = document.getElementById('shareIdText');
      const elTitle = document.getElementById('title');
      const elSubtitle = document.getElementById('subtitle');
      const elMeta = document.getElementById('meta');
      const elLoading = document.getElementById('loading');
      const elPw = document.getElementById('pw');
      const elPwInput = document.getElementById('pwInput');
      const elPwBtn = document.getElementById('pwBtn');
      const elError = document.getElementById('error');
      const elContentWrap = document.getElementById('contentWrap');
      const elContent = document.getElementById('content');
      const elAttachmentsWrap = document.getElementById('attachmentsWrap');
      const elAttachments = document.getElementById('attachments');
      const elCopyBtn = document.getElementById('copyBtn');
      const elDownloadBtn = document.getElementById('downloadBtn');
      const elRefreshBtn = document.getElementById('refreshBtn');

      elShareIdText.textContent = shareId;

      function showError(msg) {{
        elError.textContent = msg;
        elError.style.display = 'block';
      }}

      function clearError() {{
        elError.textContent = '';
        elError.style.display = 'none';
      }}

      function setLoading(isLoading) {{
        elLoading.style.display = isLoading ? 'block' : 'none';
      }}

      function escapeHtml(s) {{
        return String(s).replace(/[&<>"']/g, (ch) => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}})[ch]);
      }}

      function withPassword(url) {{
        if (!password) return url;
        const raw = String(url || '');
        try {{
          const u = new URL(raw, window.location.origin);
          // Only attach password for same-origin attachment downloads.
          if (u.origin !== window.location.origin) return url;
          if (!u.pathname.startsWith('/api/file/') && !u.pathname.startsWith('/attachments/')) return url;
          u.searchParams.set('password', password);
          return u.toString();
        }} catch {{
          // Best-effort fallback for path-only values.
          if (!raw.startsWith('/api/file/') && !raw.startsWith('/attachments/')) return url;
          const hasQuery = raw.includes('?');
          const sep = hasQuery ? '&' : '?';
          return raw + sep + 'password=' + encodeURIComponent(password);
        }}
      }}

      function safeUrl(url) {{
        const raw = String(url || '').trim();
        if (!raw) return '#';
        try {{
          const u = new URL(raw, window.location.origin);
          if (u.protocol === 'http:' || u.protocol === 'https:') return withPassword(u.toString());
          return '#';
        }} catch {{
          // Allow local absolute paths as-is.
          if (raw.startsWith('/')) return withPassword(raw);
          return '#';
        }}
      }}

      function formatDate(iso) {{
        if (!iso) return '';
        try {{
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return String(iso);
          const fmt = new Intl.DateTimeFormat(undefined, {{ dateStyle: 'medium', timeStyle: 'short' }});
          return fmt.format(d);
        }} catch {{
          return String(iso);
        }}
      }}

      function titleFromContent(content) {{
        const lines = String(content || '').split(/\\r?\\n/).map(s => s.trim()).filter(Boolean);
        if (lines.length === 0) return 'Shared note';
        const first = lines[0].replace(/^#+\\s*/, '').trim();
        return first.slice(0, 120) || 'Shared note';
      }}

      async function fetchPublicDetail() {{
        clearError();
        const body = {{ json: {{ shareEncryptedUrl: shareId }} }};
        if (password) body.json.password = password;
        const resp = await fetch('/api/trpc/notes.publicDetail', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify(body)
        }});
        const data = await resp.json();
        if (!resp.ok || data.error) {{
          throw new Error(data?.error?.message || 'Failed to load share');
        }}
        return data.result.data;
      }}

      function renderMeta(note) {{
        const items = [];
        if (note.updatedAt) items.push(`<span class="pill"><strong>Updated</strong> ${escapeHtml(formatDate(note.updatedAt))}</span>`);
        if (note.shareExpiryDate) items.push(`<span class="pill"><strong>Expires</strong> ${escapeHtml(formatDate(note.shareExpiryDate))}</span>`);
        if (items.length === 0) {{
          elMeta.style.display = 'none';
          return;
        }}
        elMeta.innerHTML = items.join('');
        elMeta.style.display = 'flex';
      }}

      function renderAttachments(note) {{
        const atts = Array.isArray(note.attachments) ? note.attachments : [];
        if (atts.length === 0) {{
          elAttachmentsWrap.style.display = 'none';
          elAttachments.innerHTML = '';
          return;
        }}

        const cards = [];
        for (const a of atts) {{
          const name = a.name || a.path || 'attachment';
          const href = safeUrl(a.path || '');
          const mime = typeof a.type === 'string' ? a.type : '';
          const isImage = mime.startsWith('image/');
          const ico = isImage ? 'IMG' : (mime.includes('pdf') ? 'PDF' : 'FILE');
          const hint = mime ? mime : 'attachment';
          cards.push(
            `<div class="att">
              <div class="ico" aria-hidden="true">${escapeHtml(ico)}</div>
              <div class="meta">
                <div class="name"><a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(name)}</a></div>
                <div class="hint">${escapeHtml(hint)}</div>
              </div>
            </div>`
          );
        }}
        elAttachments.innerHTML = cards.join('');
        elAttachmentsWrap.style.display = 'block';
      }}

      function inlineMd(text) {{
        let s = escapeHtml(text);
        // Images
        s = s.replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)/g, (m, alt, url) => {{
          const href = safeUrl(url);
          if (href === '#') return escapeHtml(m);
          return `<img src="${escapeHtml(href)}" alt="${escapeHtml(alt || '')}" loading="lazy" />`;
        }});
        // Links
        s = s.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, (m, label, url) => {{
          const href = safeUrl(url);
          if (href === '#') return escapeHtml(label);
          return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
        }});
        // Inline code
        s = s.replace(/`([^`]+)`/g, (m, code) => `<code>${escapeHtml(code)}</code>`);
        // Bold / italic (simple, non-nested)
        s = s.replace(/\\*\\*([^*]+)\\*\\*/g, (m, t) => `<strong>${escapeHtml(t)}</strong>`);
        s = s.replace(/__([^_]+)__/g, (m, t) => `<strong>${escapeHtml(t)}</strong>`);
        s = s.replace(/\\*([^*]+)\\*/g, (m, t) => `<em>${escapeHtml(t)}</em>`);
        s = s.replace(/_([^_]+)_/g, (m, t) => `<em>${escapeHtml(t)}</em>`);
        return s;
      }}

      function renderMarkdown(md) {{
        const src = String(md || '').replace(/\\r\\n?/g, '\\n');
        const codeBlocks = [];
        const withoutCode = src.replace(/```([a-zA-Z0-9_-]+)?\\n([\\s\\S]*?)```/g, (m, lang, code) => {{
          const id = codeBlocks.length;
          codeBlocks.push({{ lang: (lang || '').trim(), code: String(code || '') }});
          return `@@CODE_${id}@@`;
        }});

        const lines = withoutCode.split('\\n');
        let html = '';
        let para = [];
        let listType = null; // 'ul' | 'ol'
        let inBlockquote = false;

        const flushPara = () => {{
          if (para.length === 0) return;
          const joined = para.join('\\n');
          html += `<p>${inlineMd(joined).replace(/\\n/g, '<br />')}</p>`;
          para = [];
        }};

        const closeList = () => {{
          if (!listType) return;
          html += `</${listType}>`;
          listType = null;
        }};

        const closeBlockquote = () => {{
          if (!inBlockquote) return;
          flushPara();
          closeList();
          html += `</blockquote>`;
          inBlockquote = false;
        }};

        for (const rawLine of lines) {{
          const line = rawLine.replace(/\\s+$/,'');
          const trimmed = line.trim();

          // Code block token
          const codeMatch = trimmed.match(/^@@CODE_(\\d+)@@$/);
          if (codeMatch) {{
            closeBlockquote();
            flushPara();
            closeList();
            const idx = Number(codeMatch[1]);
            const block = codeBlocks[idx] || {{ lang: '', code: '' }};
            const langClass = block.lang ? ` class="language-${{escapeHtml(block.lang)}}"` : '';
            html += `<pre><code${{langClass}}>${{escapeHtml(block.code)}}</code></pre>`;
            continue;
          }}

          // Blank
          if (!trimmed) {{
            flushPara();
            closeList();
            closeBlockquote();
            continue;
          }}

          // Horizontal rule
          if (/^(-{{3,}}|_{{3,}}|\\*{{3,}})$/.test(trimmed)) {{
            closeBlockquote();
            flushPara();
            closeList();
            html += `<div class="hr"></div>`;
            continue;
          }}

          // Blockquote
          if (trimmed.startsWith('> ')) {{
            if (!inBlockquote) {{
              flushPara();
              closeList();
              html += `<blockquote>`;
              inBlockquote = true;
            }}
            para.push(trimmed.slice(2));
            continue;
          }} else if (inBlockquote) {{
            // End blockquote when a non-quote line appears.
            closeBlockquote();
          }}

          // Headings
          const h = trimmed.match(/^(#{1,6})\\s+(.*)$/);
          if (h) {{
            flushPara();
            closeList();
            const level = h[1].length;
            html += `<h${level}>${inlineMd(h[2])}</h${level}>`;
            continue;
          }}

          // Lists
          const ul = trimmed.match(/^[-*+]\\s+(.*)$/);
          const ol = trimmed.match(/^\\d+\\.\\s+(.*)$/);
          if (ul || ol) {{
            flushPara();
            const nextType = ul ? 'ul' : 'ol';
            if (listType && listType !== nextType) {{
              closeList();
            }}
            if (!listType) {{
              html += `<${nextType}>`;
              listType = nextType;
            }}
            const item = (ul ? ul[1] : ol[1]) || '';
            html += `<li>${inlineMd(item)}</li>`;
            continue;
          }}

          // Normal line: treat as paragraph.
          para.push(trimmed);
        }}

        // Flush rest.
        closeBlockquote();
        flushPara();
        closeList();
        return html;
      }}

      function renderNote(note) {{
        const title = titleFromContent(note.content);
        document.title = title;
        elTitle.textContent = title;

        const sub = [];
        if (note.sharePassword) sub.push('Password protected');
        if (note.attachments && note.attachments.length) sub.push(`${note.attachments.length} attachment${note.attachments.length === 1 ? '' : 's'}`);
        if (sub.length) {{
          elSubtitle.textContent = sub.join(' · ');
          elSubtitle.style.display = 'block';
        }} else {{
          elSubtitle.style.display = 'none';
        }}

        renderMeta(note);
        elContent.innerHTML = renderMarkdown(note.content || '');
        renderAttachments(note);
      }}

      async function load() {{
        setLoading(true);
        clearError();
        elContentWrap.style.display = 'none';
        elPw.style.display = 'none';

        try {{
          const result = await fetchPublicDetail();
          if (result.error === 'expired') {{
            showError('This share link has expired.');
            return;
          }}
          if (result.hasPassword && !password) {{
            elPwInput.value = '';
            elPw.style.display = 'block';
            return;
          }}
          const note = result.data;
          if (!note) {{
            showError('Share not found.');
            return;
          }}
          renderNote(note);
          elContentWrap.style.display = 'block';
        }} catch (e) {{
          showError(e && e.message ? e.message : 'Failed to load share.');
        }} finally {{
          setLoading(false);
        }}
      }}

      elPwBtn.addEventListener('click', () => {{
        password = (elPwInput.value || '').trim();
        load();
      }});
      elPwInput.addEventListener('keydown', (e) => {{
        if (e.key === 'Enter') {{
          password = (elPwInput.value || '').trim();
          load();
        }}
      }});

      elRefreshBtn.addEventListener('click', () => load());

      elCopyBtn.addEventListener('click', async () => {{
        try {{
          await navigator.clipboard.writeText(window.location.href);
          elCopyBtn.textContent = 'Copied';
          setTimeout(() => (elCopyBtn.textContent = 'Copy link'), 900);
        }} catch {{
          showError('Copy failed. You can manually copy the URL from the address bar.');
        }}
      }});

      elDownloadBtn.addEventListener('click', async () => {{
        try {{
          // Best-effort: reuse the currently rendered title as filename.
          const filenameBase = (document.title || 'shared-note').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g,'').slice(0, 60) || 'shared-note';
          // Fetch once to get the latest content (avoids storing large content in DOM state).
          const result = await fetchPublicDetail();
          const note = result && result.data ? result.data : null;
          const content = note && typeof note.content === 'string' ? note.content : '';
          const blob = new Blob([content], {{ type: 'text/markdown;charset=utf-8' }});
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${filenameBase}.md`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        }} catch {{
          showError('Download failed.');
        }}
      }});

      load();
    </script>
  </body>
</html>"#;

    // The template is authored as if it were a Rust `format!` string, so it uses `{{` / `}}`
    // to represent JS/CSS braces. Since we now do plain string replacement, normalize them.
    template
        .replace("__BLINKO_SHARE_ID__", &share_id_js)
        .replace("__BLINKO_PASSWORD_HINT__", &password_hint_js)
        .replace("{{", "{")
        .replace("}}", "}")
}

fn js_string(value: &str) -> String {
    // JSON string is valid JS string literal.
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}
