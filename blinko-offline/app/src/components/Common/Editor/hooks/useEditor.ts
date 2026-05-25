import { useEffect, useRef, useState } from 'react';
import { eventBus } from '@/lib/event';
import { EditorStore } from '../editorStore';
import { FocusEditorFixMobile, HandleFileType } from '../editorUtils';
import { BlinkoStore } from '@/store/blinkoStore';
import { OnSendContentType } from '../type';
import Vditor from 'vditor';
import { ToolbarMobile, ToolbarPC } from '../EditorToolbar';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';
import { i18nEditor } from '../EditorToolbar/i18n';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'usehooks-ts';
import { useTheme } from 'next-themes';
import { AIExtend, Extend } from '../EditorToolbar/extends';
import { NoteType, toNoteTypeEnum } from '@shared/lib/types';
import { api } from '@/lib/trpc';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getBlinkoEndpoint, getAssetBaseUrl } from '@/lib/blinkoEndpoint';
import { sanitizeBlobLinksWithAttachments } from '@/lib/markdown/sanitizeBlobLinks';
import { createProtectedApiImageResolver } from '@/lib/media/protectedApiImages';
import * as echarts from 'echarts';
import { FontManager } from '@/lib/fontManager';
import { showImagePreviewDialog } from '@/components/Common/ImagePreviewDialog';
import { applyEditorFullscreenLayoutFix } from '../fullscreenLayoutFix';
import { getHighlightStyle, resolveEditorTheme } from './theme';
// Expose echarts globally for vditor chartRender
if (typeof window !== 'undefined' && !(window as any).echarts) {
  (window as any).echarts = echarts;
}

type WaitForLocalApiOpts = {
  attempts: number;
  delayMs: number;
  timeoutMs: number;
  maxDelayMs?: number;
};

const isHttpUrl = (value: string): boolean =>
  value.startsWith('http://') || value.startsWith('https://');

const isLocalHttpOrigin = (value: string): boolean =>
  value.startsWith('http://127.0.0.1') || value.startsWith('http://localhost');

const sleepMs = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    let done = false;
    let id: number | null = null;
    const onAbort = () => {
      cleanup();
      reject(new Error('aborted'));
    };
    const cleanup = () => {
      if (done) return;
      done = true;
      try {
        signal?.removeEventListener('abort', onAbort);
      } catch {
        // ignore
      }
      if (id != null) window.clearTimeout(id);
    };
    id = window.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export async function waitForLocalApiAsset(
  baseUrl: string,
  path: string,
  opts: WaitForLocalApiOpts,
  signal?: AbortSignal,
): Promise<void> {
  const base = (baseUrl ?? '').trim().replace(/\/+$/, '');
  const rel = (path ?? '').trim().startsWith('/') ? (path ?? '').trim() : `/${(path ?? '').trim()}`;
  if (!base || !isHttpUrl(base)) throw new Error('invalid_base_url');
  const url = `${base}${rel}`;

  const attempts = Math.max(1, Math.floor(opts.attempts));
  const maxDelayMs = Math.max(0, Math.floor(opts.maxDelayMs ?? 1200));
  let delay = Math.max(0, Math.floor(opts.delayMs));
  const timeoutMs = Math.max(250, Math.floor(opts.timeoutMs));
  let lastError: unknown = null;

  for (let i = 0; i < attempts; i += 1) {
    if (signal?.aborted) throw new Error('aborted');

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (res.ok) {
        return;
      }
      lastError = new Error(`status_${res.status}`);
    } catch (err) {
      lastError = err;
    } finally {
      window.clearTimeout(timeout);
      try {
        signal?.removeEventListener('abort', onAbort);
      } catch {
        // ignore
      }
    }

    if (i < attempts - 1) {
      await sleepMs(delay, signal);
      delay = Math.min(maxDelayMs, Math.max(delay + 50, Math.floor(delay * 1.8)));
    }
  }

  const suffix = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown');
  throw new Error(`local_api_asset_unavailable:${suffix}`);
}

/**
 * Update code highlight CSS link
 * This function ensures CSS file is loaded before code highlighting renders
 * 
 * @param theme - Current theme ('dark' | 'light')
 * @param cdn - CDN URL
 */
const updateHighlightCSS = (theme: string, cdn: string): void => {
  const styleName = getHighlightStyle(theme);
  const href = `${cdn}/dist/js/highlight.js/styles/${styleName}.min.css`;
  const existingLink = document.getElementById("vditorHljsStyle") as HTMLLinkElement;
  
  // Update if link doesn't exist or href doesn't match
  if (!existingLink || existingLink.getAttribute('href') !== href) {
    // Remove old link
    if (existingLink) {
      existingLink.remove();
    }
    
    // Create new link
    const styleElement = document.createElement("link");
    styleElement.id = "vditorHljsStyle";
    styleElement.rel = "stylesheet";
    styleElement.type = "text/css";
    styleElement.href = href;
    document.getElementsByTagName("head")[0].appendChild(styleElement);
  }
};

/**
 * Update vditor instance code highlight theme configuration
 * 
 * @param vditorInstance - Vditor instance
 * @param theme - Current theme
 */
const updateVditorHighlightConfig = (vditorInstance: Vditor, theme: string): void => {
  const styleName = getHighlightStyle(theme);
  // Vditor's internal configuration for subsequent preview rendering
  const vditorOptions = (vditorInstance as any).options;
  if (vditorOptions?.preview?.hljs) {
    vditorOptions.preview.hljs.style = styleName;
  }
};

/**
 * Apply theme class to editor element for CSS-based theme support (ABCJS, mindmap)
 */
const applyThemeToEditor = (mode: string, theme: string): void => {
  const editorElement = document.querySelector(`#vditor-${mode}`) as HTMLElement;
  if (editorElement) {
    if (theme === 'dark') {
      editorElement.classList.add('vditor-theme-dark');
      editorElement.classList.remove('vditor-theme-light');
    } else {
      editorElement.classList.add('vditor-theme-light');
      editorElement.classList.remove('vditor-theme-dark');
    }
  }
};

/**
 * Render all supported Vditor content types
 * @param editorElement - Editor element
 * @param mode - Editor mode (for finding element)
 * @param theme - Current theme
 * @param vditorInstance - Vditor instance (optional, for updating configuration)
 */
const renderAllVditorContent = (
  editorElement: HTMLElement | null,
  mode: string,
  theme: string,
  vditorInstance?: Vditor
) => {
  if (!editorElement) {
    const element = document.querySelector(`#vditor-${mode}`);
    if (!element) return;
    editorElement = element as HTMLElement;
  }

  const cdn = getAssetBaseUrl();
  const styleName = getHighlightStyle(theme);

  // Update CSS link (ensure it's loaded before rendering)
  updateHighlightCSS(theme, cdn);
  
  // Update vditor instance configuration (if instance is provided)
  if (vditorInstance) {
    updateVditorHighlightConfig(vditorInstance, theme);
  }

  // IMPORTANT: Never run preview renderers against the editable root. In IR mode, the editor contains
  // contenteditable nodes; DOM rewrites there can reset the caret/selection while typing.
  const previewTargets: HTMLElement[] = (() => {
    const svPreview = editorElement.querySelector('.vditor-preview') as HTMLElement | null;
    if (svPreview) return [svPreview];
    const irPreviews = Array.from(editorElement.querySelectorAll('.vditor-ir__preview')) as HTMLElement[];
    if (irPreviews.length > 0) return irPreviews;
    return [];
  })();
  if (previewTargets.length === 0) return;

  for (const target of previewTargets) {
    // Render code blocks with copy button
    Vditor.codeRender(target);

    // Render code syntax highlighting
    Vditor.highlightRender({
      enable: true,
      style: styleName,
      lineNumber: true,
    }, target, cdn);

    // Render math formulas (use MathJax as configured in vditor options)
    Vditor.mathRender(target, {
      cdn,
      math: {
        engine: 'MathJax'
      }
    });

    // Render Mermaid diagrams (flowchart, sequence diagram, gantt chart, etc.)
    Vditor.mermaidRender(target, cdn, theme);

    // Render Graphviz diagrams
    Vditor.graphvizRender(target, cdn);

    // Render PlantUML diagrams
    Vditor.plantumlRender(target, cdn);

    // Render ECharts charts
    Vditor.chartRender(target, cdn, theme);

    // Render flowchart.js
    Vditor.flowchartRender(target, cdn);

    // Render mindmap
    Vditor.mindmapRender(target, cdn, theme);

    // Render markmap (markdown mindmap)
    Vditor.markmapRender(target, cdn);

    // Render SMILES (chemical structures)
    Vditor.SMILESRender(target, cdn, theme);

    // Render ABC notation (musical staves)
    Vditor.abcRender(target, cdn);

    // Render media (video, audio, iframe)
    Vditor.mediaRender(target);

    // Lazy load images
    Vditor.lazyLoadImageRender(target);
  }
};

  const lockEditorHorizontalPan = (mode: string): (() => void) => {
  const cleanups: Array<() => void> = [];
  const timeouts: number[] = [];
  const seen = new Set<HTMLElement>();

  const root = document.querySelector(`#vditor-${mode}`) as HTMLElement | null;
  if (!root) return () => {};

    const selectTargets = (): HTMLElement[] => {
      const inEditor = [
        `#vditor-${mode}`,
        `#vditor-${mode} .vditor-content`,
        `#vditor-${mode} .vditor-preview`,
        `#vditor-${mode} .vditor-ir`,
        `#vditor-${mode} .vditor-sv`,
        `#vditor-${mode} .vditor-wysiwyg`,
      `#vditor-${mode} .vditor-ir .vditor-reset`,
      `#vditor-${mode} .vditor-sv .vditor-reset`,
      `#vditor-${mode} .vditor-wysiwyg .vditor-reset`,
    ]
      .map((selector) => document.querySelector(selector) as HTMLElement | null)
      .filter(Boolean) as HTMLElement[];

    // Some layouts can also keep a horizontal offset at the parent scroll-area level.
    const scrollAreaParent = root.closest('[data-scroll-area-id]') as HTMLElement | null;
    return scrollAreaParent ? [...inEditor, scrollAreaParent] : inEditor;
  };

  const clampAll = () => {
    for (const el of selectTargets()) {
      if (el.scrollLeft !== 0) {
        el.scrollLeft = 0;
      }
    }
  };

  const bindElement = (el: HTMLElement) => {
    if (seen.has(el)) return;
    seen.add(el);

    const clamp = () => {
      if (el.scrollLeft !== 0) {
        el.scrollLeft = 0;
      }
    };
    const clampOnNextFrame = () => requestAnimationFrame(clampAll);

    clamp();
    el.addEventListener('scroll', clamp, { passive: true });
    el.addEventListener('wheel', clampOnNextFrame, { passive: true });
    cleanups.push(() => {
      el.removeEventListener('scroll', clamp);
      el.removeEventListener('wheel', clampOnNextFrame);
    });
  };

  const bindAll = () => {
    for (const el of selectTargets()) {
      bindElement(el);
    }
    clampAll();
  };

  // Bind now and retry after mount transitions; Vditor creates some nodes asynchronously.
  bindAll();
  for (const delayMs of [0, 50, 150, 400, 900]) {
    const id = window.setTimeout(() => bindAll(), delayMs);
    timeouts.push(id);
  }

  return () => {
    for (const id of timeouts) {
      window.clearTimeout(id);
    }
    for (const cleanup of cleanups) cleanup();
  };
};

export const useEditorInit = (
  store: EditorStore,
  onChange: ((content: string) => void) | undefined,
  onSend: (args: OnSendContentType) => Promise<any>,
  mode: 'create' | 'edit' | 'comment',
  originReference: number[] = [],
  content: string
) => {
  const { t } = useTranslation()
  const isPc = useMediaQuery('(min-width: 768px)')
  const { theme: currentTheme, resolvedTheme } = useTheme()
  const [assetBase, setAssetBase] = useState(() => getAssetBaseUrl())
  const [initRetryNonce, setInitRetryNonce] = useState(0)
  const blinko = RootStore.Get(BlinkoStore)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const lastSelectedNoteIdRef = useRef<number | null>(null);
  const renderDebounceRef = useRef<any>(null);
  const horizontalPanCleanupRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    const handler = (base?: string) => {
      const next = typeof base === 'string' ? base.trim() : '';
      if (next && isHttpUrl(next)) {
        setAssetBase(next);
        return;
      }
      setAssetBase(getAssetBaseUrl());
    };
    eventBus.on('local-api:ready', handler);
    return () => {
      eventBus.off('local-api:ready', handler);
    };
  }, []);

  useEffect(() => {
    let imgResolver: ReturnType<typeof createProtectedApiImageResolver> | null = null;
    let imgClickCleanup: (() => void) | null = null;
    let retryButtonCleanup: (() => void) | null = null;
    const abort = new AbortController();
    // Reset note tracking when the editor instance is recreated.
    lastSelectedNoteIdRef.current = mode === 'edit' ? (blinko.curSelectedNote?.id ?? null) : null;

    const showToolbar = store.isShowEditorToolbar(isPc)
    try {
      horizontalPanCleanupRef.current?.();
    } catch {}
    horizontalPanCleanupRef.current = null;

    if (store.vditor) {
      store.vditor?.destroy();
      store.vditor = null
    }

    // Vditor icons are injected once in `src/main.tsx` (no inline script) to satisfy CSP.

    const theme = resolveEditorTheme(currentTheme, resolvedTheme);
    const cdn = assetBase || getAssetBaseUrl();
    const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI__;
    const mount = document.getElementById(`vditor-${mode}`);

    const showEditorPlaceholder = (args: { title: string; detail?: string; retry?: boolean }) => {
      if (!mount) return;
      const detail = (args.detail ?? '').trim();
      const retryId = `blinko-editor-retry-${mode}`;
      mount.innerHTML = `
        <div style="padding:12px; font-size:14px; color: var(--foreground); opacity:0.85;">
          <div style="font-weight:600; margin-bottom:6px;">${args.title}</div>
          ${detail ? `<div style="font-size:12px; opacity:0.8; margin-bottom:10px; white-space:pre-wrap;">${detail}</div>` : ''}
          ${args.retry ? `<button id="${retryId}" style="padding:8px 10px; border:1px solid rgba(127,127,127,0.35); border-radius:8px;">${t('retry') ?? 'Retry'}</button>` : ''}
        </div>
      `;
      if (args.retry) {
        const btn = document.getElementById(retryId);
        if (btn) {
          const onClick = () => setInitRetryNonce((v) => v + 1);
          btn.addEventListener('click', onClick);
          retryButtonCleanup = () => btn.removeEventListener('click', onClick);
        }
      }
    };

    if (isTauri && !cdn) {
      showEditorPlaceholder({
        title: t('loading') ?? 'Loading',
        detail: 'Starting local editor…',
      });
      return () => {
        abort.abort();
        retryButtonCleanup?.();
      };
    }
    
    // Pre-load CSS before vditor initialization to ensure it's ready when code blocks render
    // This is key: load CSS before vditor initialization to ensure styles are available when code highlighting renders
    updateHighlightCSS(theme, cdn);
    
    const init = async () => {
      if (isTauri && isLocalHttpOrigin(cdn)) {
        showEditorPlaceholder({
          title: t('loading') ?? 'Loading',
          detail: 'Waiting for local API…',
        });
        try {
          await waitForLocalApiAsset(
            cdn,
            '/dist/js/lute/lute.min.js',
            { attempts: 10, delayMs: 150, timeoutMs: 900, maxDelayMs: 1200 },
            abort.signal,
          );
        } catch (err: any) {
          const message = err instanceof Error ? err.message : String(err ?? 'unknown');
          showEditorPlaceholder({
            title: 'Editor failed to start',
            detail: message,
            retry: true,
          });
          return;
        }
      }

    const vditor = new Vditor("vditor" + "-" + mode, {
      width: '100%',
      "toolbar": isPc ? ToolbarPC : ToolbarMobile,
      mode: store.viewMode === 'raw' ? 'sv' : store.viewMode,
      theme,
      hint: {
        extend: mode != 'comment' ? Extend : AIExtend
      },
      // Use local server for vditor dependencies (downloaded to server/dist/js/)
      cdn,
      async ctrlEnter(md) {
        await store.handleSend()
      },
      customWysiwygToolbar: (type: TWYSISYGToolbar, element: HTMLElement) => {
        console.log(type, element)
      },
      placeholder: t('i-have-a-new-idea'),
      i18n: {
        ...i18nEditor(t)
      },
      input: (value) => {
        onChange?.(value)
        // Re-render all content when content changes (for preview mode)
        if (store.viewMode !== 'raw') {
          if (renderDebounceRef.current) {
            clearTimeout(renderDebounceRef.current);
          }
          renderDebounceRef.current = setTimeout(() => {
            const inputTheme = resolveEditorTheme(currentTheme, resolvedTheme);
            renderAllVditorContent(null, mode, inputTheme, vditor);
            // Apply theme class to editor for ABCJS and mindmap dark mode support
            applyThemeToEditor(mode, inputTheme);
          }, 250);
        }
      },
      upload: {
        url: getBlinkoEndpoint('/api/file/upload'),
        success: (editor, res) => {
          const { fileName, filePath, type, size } = JSON.parse(res)
          store.handlePasteFile({
            fileName,
            filePath,
            type,
            size
          })
        },
        headers: {
          'Authorization': `Bearer ${RootStore.Get(UserStore).token}`
        },
        withCredentials: true,
        max: 1024 * 1024 * 1000,
        fieldName: 'file',
        multiple: false,
        linkToImgUrl: getBlinkoEndpoint('/api/file/upload-by-url'),
        linkToImgFormat(res) {
          const data = JSON.parse(res)
          const result = {
            msg: '',
            code: 0,
            data: {
              originalURL: data.originalURL,
              url: data.filePath,
            }
          }
          return JSON.stringify(result)
        }
      },
      tab: '\t',
      undoDelay: 20,
      value: content,
      toolbarConfig: {
        hide: !showToolbar,
      },
      preview: {
        hljs: {
          enable: true,
          style: getHighlightStyle(theme),
          lineNumber: true,
        },
        theme,
        delay: 20,
        math: {
          engine: 'MathJax',
        }
      },
      after: () => {
        const initialContent = sanitizeBlobLinksWithAttachments(
          content ?? '',
          store.files.map((f: any) => ({ name: f?.name, path: f?.uploadPromise?.value || f?.preview })),
        );
        vditor.setValue(initialContent);
        store.init({
          onChange,
          onSend,
          mode,
          vditor
        });
        // Ensure any persisted attachment paths are used instead of ephemeral `blob:` links.
        // This is important on first mount where `originFiles` may have already populated `store.files`
        // before vditor is ready, causing the earlier sanitization attempt to no-op.
        store.fixBlobLinksInCurrentContent?.();

        // Handle raw markdown mode (hide preview)
        if (store.viewMode === 'raw') {
          const previewElement = document.querySelector(`#vditor-${mode} .vditor-preview`);
          if (previewElement) {
            (previewElement as HTMLElement).style.display = 'none';
          }
        }

        // Keep editable root horizontally anchored to avoid left-side text clipping after trackpad pan.
        horizontalPanCleanupRef.current = lockEditorHorizontalPan(mode);

        // Render all supported content types in preview
        // Use currentTheme to ensure correct theme is used
        const finalTheme = resolveEditorTheme(currentTheme, resolvedTheme);
        renderAllVditorContent(null, mode, finalTheme, vditor);
        // Apply theme class to editor for ABCJS and mindmap dark mode support
        applyThemeToEditor(mode, finalTheme);

        // Resolve protected `/api/...` images inside the editor preview.
        const editorElement = document.querySelector(`#vditor-${mode}`) as HTMLElement | null;
        if (editorElement) {
          imgResolver?.disconnect();
          imgResolver = createProtectedApiImageResolver();
          imgResolver.observe(editorElement);

          // Replace Vditor's default fullscreen image viewer with our own stable dialog.
          const onImgClick = (e: MouseEvent) => {
            const t = e.target as any;
            if (!t || t.tagName !== 'IMG') return;
            // Only handle images inside the editor area.
            if (!editorElement.contains(t)) return;

            try {
              e.preventDefault();
              e.stopPropagation();
              // @ts-ignore
              e.stopImmediatePropagation?.();
            } catch {
              // ignore
            }

            const resolvedSrc =
              (t.getAttribute('src') || '').trim() ||
              (t.getAttribute('data-src') || '').trim();
            const originalSrc =
              (t.getAttribute('data-blinko-resolved-from') || '').trim() ||
              (t.getAttribute('data-src') || '').trim() ||
              (t.getAttribute('src') || '').trim();

            if (!resolvedSrc) return;
            showImagePreviewDialog({
              resolvedSrc,
              originalSrc,
              title: (t.getAttribute('alt') || '').trim() || undefined,
            });
          };

          editorElement.addEventListener('click', onImgClick, true);
          imgClickCleanup = () => editorElement.removeEventListener('click', onImgClick, true);
        }

        if (isPc) {
          store.focus();
        } else {
          try {
            FocusEditorFixMobile(document.querySelector(`#vditor-${mode}`) as HTMLElement | null);
          } catch {
            FocusEditorFixMobile();
          }
        }
      },
    });
    };
    void init();
    // Clear the effect
    return () => {
      abort.abort();
      if (renderDebounceRef.current) {
        clearTimeout(renderDebounceRef.current);
        renderDebounceRef.current = null;
      }
      imgClickCleanup?.();
      retryButtonCleanup?.();
      imgResolver?.disconnect?.();
      store.vditor?.destroy();
      store.vditor = null;
      try {
        horizontalPanCleanupRef.current?.();
      } catch {}
      horizontalPanCleanupRef.current = null;
    };

  }, [mode, blinko.config.value?.toolbarVisibility, store.viewMode, store.isFullscreen, isPc, assetBase, initRetryNonce]);

  // Update vditor theme configuration when theme changes
  useEffect(() => {
    if (store.vditor) {
      const cdn = assetBase || getAssetBaseUrl();
      if (!cdn) return;
      const activeTheme = resolveEditorTheme(currentTheme, resolvedTheme);
      
      // Update CSS link
      updateHighlightCSS(activeTheme, cdn);
      
      // Update vditor instance configuration
      updateVditorHighlightConfig(store.vditor, activeTheme);
      
      // Re-render code highlighting
      const editorElement = document.querySelector(`#vditor-${mode}`) as HTMLElement;
      if (editorElement) {
        const previewElement = editorElement.querySelector('.vditor-preview') as HTMLElement;
        const targetElement = previewElement || editorElement;
        Vditor.highlightRender({
          enable: true,
          style: getHighlightStyle(activeTheme),
          lineNumber: true,
        }, targetElement, cdn);
        
        // Apply theme class for ABCJS and mindmap dark mode support
        applyThemeToEditor(mode, activeTheme);
      }
    }
  }, [currentTheme, resolvedTheme, store.vditor, mode, assetBase]);

  // Update vditor content when content changes (for edit mode when note changes)
  useEffect(() => {
    if (store.vditor && content !== undefined) {
      // In edit mode, keep track of the selected note so we can safely apply server-side changes
      // (or switching notes) without resetting the caret while the user is typing.
      const selectedId = mode === 'edit' ? (blinko.curSelectedNote?.id ?? null) : null;
      if (mode === 'edit' && lastSelectedNoteIdRef.current == null) {
        lastSelectedNoteIdRef.current = selectedId;
      }

      const currentValue = store.vditor.getValue();
      const nextContent = sanitizeBlobLinksWithAttachments(
        content ?? '',
        store.files.map((f: any) => ({ name: f?.name, path: f?.uploadPromise?.value || f?.preview })),
      );

      const root = document.querySelector(`#vditor-${mode}`) as HTMLElement | null;
      const active = typeof document !== 'undefined' ? (document.activeElement as any) : null;
      const isFocused = !!(root && active && root.contains(active));

      const noteChanged = mode === 'edit' && selectedId !== lastSelectedNoteIdRef.current;

      // Only force-set content when:
      // - switching notes (edit mode), or
      // - the editor is not focused (to avoid caret jumps while typing).
      if (currentValue !== nextContent && (noteChanged || !isFocused)) {
        if (noteChanged) lastSelectedNoteIdRef.current = selectedId;
        store.vditor.setValue(nextContent);
      }
    }
  }, [content, store.vditor, store.files.length, mode, blinko.curSelectedNote?.id]);

  // Update vditor font when font style changes
  useEffect(() => {
    if (store.vditor && blinko.config.value?.fontStyle) {
      const currentFontFamily = FontManager.getCurrentFontFamily();
      if (currentFontFamily) {
        FontManager.applyFontToVditor(currentFontFamily);
      }
    }
  }, [blinko.config.value?.fontStyle, store.vditor]);

  useEffect(() => {
    store.references = originReference
    if (store.references.length > 0) {
      store.noteListByIds.call({ ids: store.references })
    }
  }, []);

  useEffect(() => {
    if (mode == 'create') {
      if (searchParams.get('path') == 'notes') {
        store.noteType = NoteType.NOTE
      } else if (searchParams.get('path') == 'todo') {
        store.noteType = NoteType.TODO
      } else {
        store.noteType = NoteType.BLINKO
      }
      if (searchParams.get('tagId')) {
        try {
          api.tags.fullTagNameById.query({ id: Number(searchParams.get('tagId')) }).then(res => {
            store.currentTagLabel = res
          })
        } catch (error) {
          console.error(error)
        }
      } else {
        store.currentTagLabel = ''
      }
    } else {
      store.noteType = toNoteTypeEnum(blinko.curSelectedNote?.type)
    }
  }, [mode, searchParams.get('path'), searchParams.get('tagId')]);
};


export const useEditorEvents = (store: EditorStore) => {
  const fullscreenRestoreRef = useRef<null | (() => void)>(null);
  const rebuildInFlightRef = useRef(false);
  type FullscreenPayload =
    | boolean
    | {
      isFullscreen: boolean;
      mode?: 'create' | 'edit' | 'comment';
      editorId?: string;
    };

  const cleanupFullscreenObservers = () => {
    if ((store as any)._resizeObserver) {
      (store as any)._resizeObserver.disconnect();
      (store as any)._resizeObserver = null;
    }
    if ((store as any)._mutationObserver) {
      (store as any)._mutationObserver.disconnect();
      (store as any)._mutationObserver = null;
    }
  };

  const rerenderEditorPreview = () => {
    const currentTheme = resolveEditorTheme(RootStore.Get(UserStore).theme, undefined);
    try {
      // Use Vditor's own preview pipeline first; this mirrors what view-mode switching triggers.
      store.vditor?.renderPreview?.();
    } catch { }
    renderAllVditorContent(null, store.mode, currentTheme, store.vditor || undefined);
    applyThemeToEditor(store.mode, currentTheme);
    (store.vditor as any)?.resize?.();
  };

  const getEditorWrapper = (): HTMLElement | null => {
    // Scope DOM queries to this editor instance (prevents cross-editor interference).
    return document.querySelector(`[data-editor-instance-id="${store.instanceId}"]`) as HTMLElement | null;
  };

  const getVditorRoot = (): HTMLElement | null => {
    const wrapper = getEditorWrapper();
    if (!wrapper) return null;
    return wrapper.querySelector(`#vditor-${store.mode}`) as HTMLElement | null;
  };

  const resetEditorHorizontalOffset = () => {
    const root = getVditorRoot();
    if (!root) return;

    const targets = [
      root,
      root.querySelector('.vditor-content') as HTMLElement | null,
      root.querySelector('.vditor-ir') as HTMLElement | null,
      root.querySelector('.vditor-sv') as HTMLElement | null,
      root.querySelector('.vditor-wysiwyg') as HTMLElement | null,
      root.querySelector('.vditor-preview') as HTMLElement | null,
      root.querySelector('.vditor-ir .vditor-reset') as HTMLElement | null,
      root.querySelector('.vditor-sv .vditor-reset') as HTMLElement | null,
      root.querySelector('.vditor-wysiwyg .vditor-reset') as HTMLElement | null,
    ].filter(Boolean) as HTMLElement[];

    for (const element of targets) {
      if (element.scrollLeft !== 0) {
        element.scrollLeft = 0;
      }
    }
  };

  const forceRecreateEditorIfBroken = () => {
    if (rebuildInFlightRef.current) return;
    if (!store.vditor) return;

    const markdown = store.vditor.getValue?.() ?? '';
    if (!markdown.trim()) return;

    const root = getVditorRoot();
    if (!root) return;

    const selectorByMode =
      store.viewMode === 'ir'
        ? '.vditor-ir .vditor-reset'
        : (store.viewMode === 'sv' || store.viewMode === 'raw')
          ? '.vditor-sv .vditor-reset'
          : '.vditor-wysiwyg .vditor-reset';

    const activeEditable = root.querySelector(selectorByMode) as HTMLElement | null;
    const hasVisibleText = !!(activeEditable && (activeEditable.textContent || '').trim().length > 0);
    if (hasVisibleText) return;

    rebuildInFlightRef.current = true;
    const originalMode = store.viewMode;
    const tempMode = originalMode === 'wysiwyg' ? 'ir' : 'wysiwyg';
    store.viewMode = tempMode as any;

    window.setTimeout(() => {
      store.viewMode = originalMode as any;
      rebuildInFlightRef.current = false;
    }, 60);
  };

  const adjustEditorHeight = () => {
    if (!store.isFullscreen) return;

    requestAnimationFrame(() => {
      // Handle different editor modes
      let editorElement: HTMLElement | null = null;

      const wrapper = getEditorWrapper();
      const root = getVditorRoot();
      if (!wrapper || !root) return;

      if (store.viewMode === 'ir') {
        editorElement = root.querySelector('.vditor-ir .vditor-reset') as HTMLElement;
      } else if (store.viewMode === 'sv' || store.viewMode === 'raw') {
        editorElement = root.querySelector('.vditor-sv .vditor-reset') as HTMLElement;
      } else if (store.viewMode === 'wysiwyg') {
        editorElement = root.querySelector('.vditor-wysiwyg .vditor-reset') as HTMLElement;
      }

      const attachmentContainer = wrapper.querySelector('.attachment-container') as HTMLElement | null;
      const referenceContainer = wrapper.querySelector('.reference-container') as HTMLElement | null;

      if (editorElement) {
        const attachmentHeight = attachmentContainer?.offsetHeight || 0;
        const referenceHeight = referenceContainer?.offsetHeight || 0;
        const toolbarHeight = 50;
        const padding = 40;

        const availableHeight = `calc(100vh - ${toolbarHeight + attachmentHeight + referenceHeight + padding}px)`;
        editorElement.style.height = availableHeight;
        editorElement.style.maxHeight = availableHeight;
      }
    });
  };

  const setupFullscreenObservers = () => {
    cleanupFullscreenObservers();

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(adjustEditorHeight);
    });

    const wrapper = getEditorWrapper();
    const root = getVditorRoot();
    const attachmentContainer = wrapper?.querySelector('.attachment-container') ?? null;
    const referenceContainer = wrapper?.querySelector('.reference-container') ?? null;
    const editorContainer = root;

    if (attachmentContainer) resizeObserver.observe(attachmentContainer);
    if (referenceContainer) resizeObserver.observe(referenceContainer);
    if (editorContainer) resizeObserver.observe(editorContainer);

    (store as any)._resizeObserver = resizeObserver;

    const mutationObserver = new MutationObserver(() => {
      requestAnimationFrame(adjustEditorHeight);
    });

    if (attachmentContainer) {
      mutationObserver.observe(attachmentContainer, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }
    if (referenceContainer) {
      mutationObserver.observe(referenceContainer, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }

    (store as any)._mutationObserver = mutationObserver;
  };

  useEffect(() => {
    if (store.isFullscreen) {
      adjustEditorHeight();
    }
  }, [store.files.length, store.references.length]);

  const handleFullScreen = (payload: FullscreenPayload) => {
    const isFullscreen = typeof payload === 'boolean' ? payload : payload.isFullscreen;
    const effectiveMode =
      typeof payload === 'object' && payload.mode ? payload.mode : store.mode;
    if (typeof payload === 'object') {
      // Scope fullscreen events to the emitting editor instance.
      if (payload.mode && payload.mode !== store.mode) return;
      if (payload.editorId && payload.editorId !== store.instanceId) return;
    }

    store.setFullscreen(isFullscreen);
    if (isFullscreen) {
      requestAnimationFrame(() => {
        if (!store.isFullscreen) return;

        try {
          fullscreenRestoreRef.current?.();
        } catch { }
        const anchorEl = document.querySelector(`#vditor-${effectiveMode}`) as HTMLElement | null;
        fullscreenRestoreRef.current = applyEditorFullscreenLayoutFix({ anchorEl });

        setupFullscreenObservers();
        adjustEditorHeight();
        rerenderEditorPreview();
      });
    } else {
      cleanupFullscreenObservers();

      try {
        fullscreenRestoreRef.current?.();
      } catch { }
      fullscreenRestoreRef.current = null;

      // Reset height for all editor modes (scoped to this editor instance).
      const root = getVditorRoot();
      if (root) {
        const irElement = root.querySelector('.vditor-ir .vditor-reset') as HTMLElement | null;
        const svElement = root.querySelector('.vditor-sv .vditor-reset') as HTMLElement | null;
        const wysiwygElement = root.querySelector('.vditor-wysiwyg .vditor-reset') as HTMLElement | null;

        [irElement, svElement, wysiwygElement].forEach(element => {
          if (element) {
            element.style.height = '';
            element.style.maxHeight = '';
          }
        });
      }

      requestAnimationFrame(() => {
        if (store.isFullscreen) return;
        rerenderEditorPreview();
      });
    }
  };

  useEffect(() => {
    const handleSetViewMode = (mode: any) => {
      store.viewMode = mode;

      // Handle preview visibility for raw mode
      const editorId = `vditor-${store.mode}`;
      const previewElement = document.querySelector(`#${editorId} .vditor-preview`);
      if (previewElement) {
        if (mode === 'raw') {
          (previewElement as HTMLElement).style.display = 'none';
        } else {
          (previewElement as HTMLElement).style.display = '';
          // Re-render all content when switching to preview mode
          setTimeout(() => {
            rerenderEditorPreview();
          }, 100);
        }
      }

      if (store.isFullscreen) {
        adjustEditorHeight();
      }
    };

    eventBus.on('editor:clear', store.clearMarkdown);
    eventBus.on('editor:insert', store.insertMarkdown);
    eventBus.on('editor:replace', store.replaceMarkdown);
    eventBus.on('editor:focus', store.focus);
    eventBus.on('editor:setViewMode', handleSetViewMode);
    eventBus.on('editor:setFullScreen', handleFullScreen);
    store.handleIOSFocus();

    // Window/viewport fullscreen toggles (OS-level) can leave Vditor in a stale layout/render state
    // until the user changes view mode. Fix by re-running the same "rerender + resize" on resize events.
    let resizeRaf: number | null = null;
    const handleViewportResize = () => {
      if (resizeRaf != null) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        try {
          rerenderEditorPreview();
        } catch { }
        resetEditorHorizontalOffset();
        requestAnimationFrame(resetEditorHorizontalOffset);
        if (store.isFullscreen) {
          try {
            adjustEditorHeight();
          } catch { }
        }
        // If WebView fullscreen/window transitions leave Vditor blank, auto-recreate it.
        // This mirrors the manual fix users do via view-mode switching.
        window.setTimeout(() => {
          forceRecreateEditorIfBroken();
        }, 120);
      });
    };
    window.addEventListener('resize', handleViewportResize, { passive: true } as any);
    window.addEventListener('orientationchange', handleViewportResize, { passive: true } as any);
    document.addEventListener('fullscreenchange', handleViewportResize);
    (window as any).visualViewport?.addEventListener?.('resize', handleViewportResize);
    (window as any).visualViewport?.addEventListener?.('scroll', handleViewportResize);
    // One initial pass after mount.
    handleViewportResize();

    return () => {
      cleanupFullscreenObservers();

      try {
        fullscreenRestoreRef.current?.();
      } catch { }
      fullscreenRestoreRef.current = null;

      eventBus.off('editor:clear', store.clearMarkdown);
      eventBus.off('editor:insert', store.insertMarkdown);
      eventBus.off('editor:replace', store.replaceMarkdown);
      eventBus.off('editor:focus', store.focus);
      eventBus.off('editor:setViewMode', handleSetViewMode);
      eventBus.off('editor:setFullScreen', handleFullScreen);

      if (resizeRaf != null) cancelAnimationFrame(resizeRaf);
      window.removeEventListener('resize', handleViewportResize as any);
      window.removeEventListener('orientationchange', handleViewportResize as any);
      document.removeEventListener('fullscreenchange', handleViewportResize);
      (window as any).visualViewport?.removeEventListener?.('resize', handleViewportResize);
      (window as any).visualViewport?.removeEventListener?.('scroll', handleViewportResize);
    };
  }, []);
};

export const useEditorFiles = (
  store: EditorStore,
  blinko: BlinkoStore,
  originFiles?: any[],
) => {
  useEffect(() => {
    if (originFiles?.length) {
      console.log({ originFiles })
      store.files = HandleFileType(originFiles);
      // Auto-fix any stale blob links in the editor now that we have stable attachment paths.
      // (The store may also fix after uploads complete.)
      store.fixBlobLinksInCurrentContent?.();
    }
  }, [originFiles]);
};

export const useEditorHeight = (
  onHeightChange: (() => void) | undefined,
  blinko: BlinkoStore,
  content: string,
  store: EditorStore
) => {
  useEffect(() => {
    onHeightChange?.();
  }, [store.noteType, content, store.files?.length, store.viewMode]);
}; 
