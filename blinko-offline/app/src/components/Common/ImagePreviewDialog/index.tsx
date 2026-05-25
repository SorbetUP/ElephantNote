import { useEffect, useMemo, useState } from "react";
import { DialogStandaloneStore } from "@/store/module/DialogStandalone";
import { Icon } from "@/components/Common/Iconify/icons";
import { downloadFromLink } from "@/lib/tauriHelper";
import axiosInstance from "@/lib/axios";
import { getBlinkoEndpoint } from "@/lib/blinkoEndpoint";
import { showExcalidrawEditorDialog } from "@/components/Common/Excalidraw/ExcalidrawEditorDialog";
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { eventBus } from "@/lib/event";

type ImagePreviewDialogProps = {
  resolvedSrc: string;
  originalSrc?: string;
  title?: string;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const isBlobLike = (s: string) => {
  const v = (s || "").trim().toLowerCase();
  return v.startsWith("blob:") || v.startsWith("data:");
};

const normalizeApiAttachmentPath = (src: string | undefined): string | null => {
  const raw = (src || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/api/")) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const u = new URL(raw);
      if (u.pathname.startsWith("/api/")) return u.pathname;
    } catch {
      // ignore
    }
  }
  return null;
};

const ensurePngName = (name: string) => {
  const n = (name || "").trim() || "image.png";
  if (/\.(png|jpg|jpeg|webp)$/i.test(n)) return n;
  return `${n}.png`;
};

const loadBlobForEditing = async (resolvedSrc: string, originalSrc?: string): Promise<Blob> => {
  // IMPORTANT: In Tauri WebView, object URLs may look like `blob:tauri://...` and can be blocked by CSP
  // when fetched. When we have a stable attachment path, always fetch the blob from the API instead.
  const apiPath = normalizeApiAttachmentPath(originalSrc);
  if (apiPath) {
    const url = getBlinkoEndpoint(apiPath);
    const res = await axiosInstance.get(url, { responseType: "blob" });
    return res.data as Blob;
  }

  const rs = (resolvedSrc || "").trim();
  if (rs && isBlobLike(rs)) {
    const r = await fetch(rs);
    return await r.blob();
  }

  // Best-effort: try fetching resolvedSrc directly (works for normal http(s) images).
  if (rs) {
    const r = await fetch(rs);
    return await r.blob();
  }

  throw new Error("No image source available");
};

const overwriteApiAttachment = async (apiPath: string, blob: Blob, fileName: string) => {
  const formData = new FormData();
  const file = new File([blob], fileName, { type: blob.type || "image/png" });
  formData.append("file", file);
  formData.append("attachment_path", apiPath);
  await axiosInstance.post(getBlinkoEndpoint("/api/file/overwrite"), formData);
};

const ImagePreviewDialog = ({ resolvedSrc, originalSrc, title }: ImagePreviewDialogProps) => {
  const [rotateDeg, setRotateDeg] = useState(0);
  const [scale, setScale] = useState(1);
  const [displaySrc, setDisplaySrc] = useState(resolvedSrc);

  useEffect(() => {
    setDisplaySrc(resolvedSrc);
  }, [resolvedSrc]);

  const headerTitle = useMemo(() => {
    const t = (title || "").trim();
    if (t) return t;
    const o = (originalSrc || "").trim();
    if (!o) return "Image";
    try {
      const u = new URL(o, typeof window !== "undefined" ? window.location.href : "http://localhost");
      return u.pathname.split("/").pop() || "Image";
    } catch {
      return o.split("/").pop() || "Image";
    }
  }, [title, originalSrc]);

  const downloadSrc = (originalSrc || resolvedSrc || "").trim();
  const canOverwrite = !!normalizeApiAttachmentPath(originalSrc);

  return (
    <div
      data-testid="image-preview-dialog"
      className="w-screen h-[100svh] bg-black/90 text-white flex flex-col"
      onClick={() => DialogStandaloneStore.close()}
    >
      <div
        className="flex items-center gap-3 px-3 py-2 border-b border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="truncate text-sm font-semibold opacity-90">{headerTitle}</div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="px-2 py-1 rounded-md hover:bg-white/10"
            onClick={() => setRotateDeg((d) => (d - 90 + 360) % 360)}
            title="Rotate left"
          >
            <Icon icon="tabler:rotate-2" width="18" height="18" />
          </button>

          <button
            type="button"
            className="px-2 py-1 rounded-md hover:bg-white/10"
            onClick={() => setRotateDeg((d) => (d + 90) % 360)}
            title="Rotate right"
          >
            <Icon icon="tabler:rotate-clockwise-2" width="18" height="18" />
          </button>

          <button
            type="button"
            className="px-2 py-1 rounded-md hover:bg-white/10"
            onClick={() => setScale((s) => clamp(Number((s + 0.25).toFixed(2)), 0.5, 4))}
            title="Zoom in"
          >
            <Icon icon="tabler:zoom-in" width="18" height="18" />
          </button>

          <button
            type="button"
            className="px-2 py-1 rounded-md hover:bg-white/10"
            onClick={() => setScale((s) => clamp(Number((s - 0.25).toFixed(2)), 0.5, 4))}
            title="Zoom out"
          >
            <Icon icon="tabler:zoom-out" width="18" height="18" />
          </button>

          <button
            type="button"
            className="px-2 py-1 rounded-md hover:bg-white/10"
            onClick={() => {
              setScale(1);
              setRotateDeg(0);
            }}
            title="Reset"
          >
            <Icon icon="tabler:refresh" width="18" height="18" />
          </button>

          <button
            type="button"
            data-testid="image-preview-edit"
            className={`px-2 py-1 rounded-md hover:bg-white/10 ${canOverwrite ? "" : "opacity-40 cursor-not-allowed"}`}
            title={canOverwrite ? "Edit with Excalidraw" : "Edit (only available for /api attachments)"}
            disabled={!canOverwrite}
            onClick={async () => {
              try {
                const initialBlob = await loadBlobForEditing(displaySrc, originalSrc);
                const fileName = ensurePngName(headerTitle);
                const apiPath = normalizeApiAttachmentPath(originalSrc) || "";

                // Close viewer first; Excalidraw uses the same singleton Dialog store.
                DialogStandaloneStore.close();
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    showExcalidrawEditorDialog({
                      title: "Edit image",
                      initialBlob,
                      initialFileName: fileName,
                      onSave: async ({ blob }) => {
                        if (!apiPath) return;
                        await overwriteApiAttachment(apiPath, blob, fileName);
                        // Notify other components that this image was updated
                        eventBus.emit('image:updated', apiPath);
                      },
                    });
                  }, 0);
                });
              } catch (err) {
                console.error("Failed to open image editor:", err);
                RootStore.Get(ToastPlugin).error("Failed to open image editor");
              }
            }}
          >
            <Icon icon="simple-icons:excalidraw" width="18" height="18" />
          </button>

          <button
            type="button"
            className="px-2 py-1 rounded-md hover:bg-white/10"
            onClick={async () => {
              if (!downloadSrc) return;
              await downloadFromLink(downloadSrc, headerTitle);
            }}
            title="Download"
          >
            <Icon icon="tabler:download" width="18" height="18" />
          </button>

          <button
            type="button"
            className="px-2 py-1 rounded-md hover:bg-white/10"
            onClick={() => DialogStandaloneStore.close()}
            title="Close"
          >
            <Icon icon="tabler:x" width="18" height="18" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3" onClick={(e) => e.stopPropagation()}>
        <div className="w-full h-full flex items-center justify-center">
          <img
            alt={headerTitle}
            src={displaySrc}
            className="max-w-[calc(100vw-24px)] max-h-[calc(100svh-64px)] object-contain select-none"
            draggable={false}
            style={{
              transform: `rotate(${rotateDeg}deg) scale(${scale})`,
              transformOrigin: "center center",
            }}
          />
        </div>
      </div>
    </div>
  );
};

export function showImagePreviewDialog(opts: ImagePreviewDialogProps) {
  DialogStandaloneStore.show({
    isOpen: true,
    title: "",
    onlyContent: true,
    noPadding: true,
    size: "full",
    transparent: true,
    isDismissable: true,
    showOnlyContentCloseButton: false,
    content: <ImagePreviewDialog {...opts} />,
  });
}
