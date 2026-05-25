import { useEffect, useMemo, useState } from 'react';
import axiosInstance from '@/lib/axios';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';
import { eventBus } from '@/lib/event';
import { isProtectedApiUrl, appendQueryParam } from '@/lib/media/protectedApiImages';
import { showImagePreviewDialog } from '@/components/Common/ImagePreviewDialog';
import { isInTauri } from '@/lib/tauriHelper';

interface ImageWrapperProps {
  src?: string;
  width?: number | string;
  height?: number | string;
  alt?: string;
}

const withTokenIfPossible = (absoluteUrl: string): string => {
  try {
    const raw = window?.localStorage?.getItem('blinkoToken');
    const parsed = raw ? JSON.parse(raw) : null;
    const token = parsed?.token;
    if (!token) return absoluteUrl;
    if (absoluteUrl.includes('token=')) return absoluteUrl;
    return appendQueryParam(absoluteUrl, 'token', token);
  } catch {
    return absoluteUrl;
  }
};

export const ImageWrapper = ({ src = '', width, height, alt }: ImageWrapperProps) => {
  const [resolvedSrc, setResolvedSrc] = useState<string>(() => {
    const normalized = (src || "").trim();
    if (!normalized) return "";
    if (isInTauri() && isProtectedApiUrl(normalized)) {
      // In Tauri, never render a raw `/api/...` attachment URL directly: the WebView origin can't serve it
      // and WebKit can get stuck showing a broken-image icon. We'll resolve to either a `?token=` URL or a
      // blob URL once the local API base (and token) are available.
      const url = getBlinkoEndpoint(normalized);
      if (url.startsWith("http://") || url.startsWith("https://")) {
        const tokenUrl = withTokenIfPossible(url);
        if (tokenUrl !== url) return tokenUrl;
      }
      return "";
    }
    return normalized;
  });
  const [retryTicker, setRetryTicker] = useState(0);

  const normalizedSrc = useMemo(() => (src || '').trim(), [src]);
  const isBlobLike = useMemo(() => {
    const v = normalizedSrc.toLowerCase();
    return v.startsWith('blob:') || v.startsWith('data:');
  }, [normalizedSrc]);

  // If local API endpoint becomes available (Tauri), retry resolving protected images.
  // Also re-run after token changes (login) to avoid "broken image until refresh".
  // Also re-run when an image is updated (e.g., Excalidraw edit).
  useEffect(() => {
    const bump = () => setRetryTicker((x) => x + 1);
    const handleImageUpdate = (updatedPath: string) => {
      // If this image matches the updated path, force a refresh
      if (normalizedSrc === updatedPath || normalizedSrc.includes(updatedPath)) {
        bump();
      }
    };

    if (isInTauri()) {
      eventBus.on('local-api:ready', bump);
      eventBus.on('user:token', bump);
    }
    eventBus.on('image:updated', handleImageUpdate);

    return () => {
      if (isInTauri()) {
        eventBus.off('local-api:ready', bump);
        eventBus.off('user:token', bump);
      }
      eventBus.off('image:updated', handleImageUpdate);
    };
  }, [normalizedSrc]);

  // In Tauri/local-api mode, images served under `/api/...` may require Authorization headers
  // (which plain <img src> can't set). Fetch as a blob and render via object URL.
  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

    const run = async () => {
      if (!normalizedSrc) {
        setResolvedSrc('');
        return;
      }
      if (isBlobLike) {
        setResolvedSrc(normalizedSrc);
        return;
      }

      // Only resolve protected API attachment URLs; keep other images as-is to avoid CORS surprises.
      if (!isProtectedApiUrl(normalizedSrc)) {
        setResolvedSrc(normalizedSrc);
        return;
      }

      try {
        const url = getBlinkoEndpoint(normalizedSrc);
        // If local API isn't ready yet in Tauri, `getBlinkoEndpoint()` returns the raw `/api/...` path.
        // Don't attempt a blob fetch against the WebView origin; wait for `local-api:ready` and retry.
        if (isInTauri() && !(url.startsWith('http://') || url.startsWith('https://'))) {
          setResolvedSrc('');
          return;
        }

        // Prefer `?token=` for <img src=...> in local-api mode (and generally in web too),
        // since some WebViews have flaky blob: URL loading. The local API explicitly allows this.
        const tokenUrl = withTokenIfPossible(url);
        if (tokenUrl !== url) {
          setResolvedSrc(tokenUrl);
          return;
        }

        const res = await axiosInstance.get(url, { responseType: 'blob' });
        objectUrl = URL.createObjectURL(res.data);
        if (!cancelled) setResolvedSrc(objectUrl);
      } catch {
        // Fallback: best-effort render via normal URL.
        if (!cancelled) setResolvedSrc(withTokenIfPossible(getBlinkoEndpoint(normalizedSrc)));
      }
    };

    run();

    return () => {
      cancelled = true;
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      }
    };
  }, [normalizedSrc, isBlobLike, retryTicker]);

  if (!resolvedSrc) return null;

  return (
    // Use an inline wrapper so images inside <p> don't create invalid HTML (a <p> cannot contain a <div>).
    // This also prevents large "tap highlight"/selection blocks in some WebViews.
    <span className="markdown-image-wrapper relative inline-block max-w-full align-top">
      <img
        src={resolvedSrc}
        alt={alt || ''}
        width={width as any}
        height={height as any}
        loading="lazy"
        draggable={false}
        className="max-w-full max-h-[260px] object-contain block cursor-zoom-in select-none"
        // Prevent browser drag/selection/tap-highlight artifacts around images.
        // eslint-disable-next-line react/style-prop-object
        style={{
          margin: 0,
          userSelect: 'none',
          WebkitUserDrag: 'none' as any,
          WebkitTapHighlightColor: 'transparent' as any,
        }}
        onClick={(e) => {
          e.stopPropagation();
          showImagePreviewDialog({
            resolvedSrc,
            originalSrc: normalizedSrc || src,
            title: alt,
          });
        }}
      />
    </span>
  );
}; 
