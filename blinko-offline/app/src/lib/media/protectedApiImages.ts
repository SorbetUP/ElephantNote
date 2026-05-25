import axiosInstance from "@/lib/axios";
import { getBlinkoEndpoint } from "@/lib/blinkoEndpoint";

export const appendQueryParam = (url: string, key: string, value: string) => {
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}${key}=${encodeURIComponent(value)}`;
};

const readTokenFromStorage = (): string | null => {
  try {
    const raw = window?.localStorage?.getItem("blinkoToken");
    const parsed = raw ? JSON.parse(raw) : null;
    const token = parsed?.token;
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
};

const withTokenIfPossible = (absoluteUrl: string): string => {
  const token = readTokenFromStorage();
  if (!token) return absoluteUrl;
  if (absoluteUrl.includes("token=")) return absoluteUrl;
  return appendQueryParam(absoluteUrl, "token", token);
};

export const isBlobLikeUrl = (src: string) => {
  const v = (src || "").trim().toLowerCase();
  return v.startsWith("blob:") || v.startsWith("data:");
};

export type ProtectedApiImageResolver = {
  disconnect: () => void;
  observe: (root: HTMLElement) => void;
  resolveIn: (root: ParentNode) => void;
};

type FetchBlob = (absoluteUrl: string) => Promise<Blob>;

const isHttpUrl = (s: string) => {
  const v = (s || "").trim().toLowerCase();
  return v.startsWith("http://") || v.startsWith("https://");
};

export const isProtectedApiUrl = (src: string) => {
  const v = (src || "").trim();
  if (!v) return false;
  if (isBlobLikeUrl(v)) return false;
  if (v.startsWith("/api/")) return true;
  if (isHttpUrl(v)) {
    try {
      const u = new URL(v);
      return u.pathname.startsWith("/api/");
    } catch {
      return false;
    }
  }
  return false;
};

export function createProtectedApiImageResolver({
  fetchBlob = async (absoluteUrl) => {
    const res = await axiosInstance.get(absoluteUrl, { responseType: "blob" });
    return res.data as Blob;
  },
  toAbsolute = (path) => getBlinkoEndpoint(path),
  shouldHandle = (src) => isProtectedApiUrl(src),
}: {
  fetchBlob?: FetchBlob;
  toAbsolute?: (path: string) => string;
  shouldHandle?: (src: string) => boolean;
} = {}): ProtectedApiImageResolver {
  const urlsByImg = new Map<HTMLImageElement, string>();
  const inflight = new Set<HTMLImageElement>();

  const cleanupImg = (img: HTMLImageElement) => {
    const prev = urlsByImg.get(img);
    if (prev) {
      try {
        URL.revokeObjectURL(prev);
      } catch {
        // ignore
      }
      urlsByImg.delete(img);
    }
    try {
      img.removeAttribute("data-blinko-resolved-from");
      img.removeAttribute("data-blinko-resolved-attr");
    } catch {
      // ignore
    }
    inflight.delete(img);
  };

  const pickSource = (img: HTMLImageElement): { url: string; attr: "src" | "data-src" } | null => {
    const src = (img.getAttribute("src") || "").trim();
    if (src && shouldHandle(src)) return { url: src, attr: "src" };

    // Vditor lazy-loads images using `data-src` and swaps it into `src` later.
    const dataSrc = (img.getAttribute("data-src") || "").trim();
    if (dataSrc && shouldHandle(dataSrc)) return { url: dataSrc, attr: "data-src" };

    return null;
  };

  const resolveImg = (img: HTMLImageElement) => {
    const picked = pickSource(img);
    if (!picked) return;
    const src = picked.url;
    const fromAttr = picked.attr;

    // Avoid refetch loops.
    const alreadyFrom = (img.getAttribute("data-blinko-resolved-from") || "").trim();
    if (alreadyFrom === src) return;
    if (inflight.has(img)) return;

    cleanupImg(img);
    inflight.add(img);

    const abs = toAbsolute(src);

    // Prefer direct `?token=` URLs when possible (local-api supports this explicitly for <img> tags).
    // Some WebViews can be flaky with `blob:` URLs.
    if (isHttpUrl(abs)) {
      const tokenUrl = withTokenIfPossible(abs);
      if (tokenUrl !== abs) {
        img.setAttribute("data-blinko-resolved-from", src);
        img.setAttribute("data-blinko-resolved-attr", fromAttr);
        img.setAttribute("src", tokenUrl);
        if (fromAttr === "data-src") {
          try {
            img.removeAttribute("data-src");
          } catch {
            // ignore
          }
        }
        inflight.delete(img);
        return;
      }
    }

    fetchBlob(abs)
      .then((blob) => {
        // If DOM mutated while we were fetching, don't overwrite.
        const currentSrc = (img.getAttribute("src") || "").trim();
        const currentDataSrc = (img.getAttribute("data-src") || "").trim();
        const stillWants =
          (fromAttr === "src" && currentSrc === src) ||
          (fromAttr === "data-src" && (currentDataSrc === src || currentSrc === src));
        if (!stillWants) return;

        const objectUrl = URL.createObjectURL(blob);
        urlsByImg.set(img, objectUrl);
        img.setAttribute("data-blinko-resolved-from", src);
        img.setAttribute("data-blinko-resolved-attr", fromAttr);
        img.setAttribute("src", objectUrl);

        // Prevent Vditor lazy-load from later swapping `/api/...` back into `src`.
        if (fromAttr === "data-src") {
          try {
            img.removeAttribute("data-src");
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // Leave as-is.
      })
      .finally(() => {
        inflight.delete(img);
      });
  };

  const resolveIn = (root: ParentNode) => {
    const imgs = Array.from(root.querySelectorAll("img"));
    for (const img of imgs) resolveImg(img as HTMLImageElement);
  };

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.target && (m.target as any).tagName === "IMG") {
        resolveImg(m.target as HTMLImageElement);
        continue;
      }
      if (m.type === "childList") {
        for (const n of Array.from(m.addedNodes || [])) {
          if (!(n instanceof Element)) continue;
          if (n.tagName === "IMG") resolveImg(n as HTMLImageElement);
          resolveIn(n);
        }
        for (const n of Array.from(m.removedNodes || [])) {
          if (!(n instanceof Element)) continue;
          if (n.tagName === "IMG") cleanupImg(n as HTMLImageElement);
          const imgs = Array.from(n.querySelectorAll?.("img") || []);
          for (const img of imgs) cleanupImg(img as HTMLImageElement);
        }
      }
    }
  });

  const observe = (root: HTMLElement) => {
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src", "data-src"],
    });
    resolveIn(root);
  };

  const disconnect = () => {
    observer.disconnect();
    for (const img of Array.from(urlsByImg.keys())) cleanupImg(img);
    urlsByImg.clear();
    inflight.clear();
  };

  return { disconnect, observe, resolveIn };
}
