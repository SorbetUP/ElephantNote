import { Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";

import { Icon } from "@/components/Common/Iconify/icons";
import { RootStore } from "@/store";
import { DialogStandaloneStore } from "@/store/module/DialogStandalone";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { resolveEditorTheme } from "@/components/Common/Editor/hooks/theme";

import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawImageElement,
} from "@excalidraw/excalidraw";

type SaveResult = {
  blob: Blob;
  fileName: string;
};

export type ExcalidrawEditorDialogOptions = {
  title?: string;
  initialBlob?: Blob;
  initialFileName?: string;
  onSave: (result: SaveResult) => Promise<void> | void;
};

const ensurePngName = (name: string | undefined) => {
  const base = (name || "excalidraw").trim() || "excalidraw";
  return base.toLowerCase().endsWith(".png") ? base : `${base}.png`;
};

let excalidrawModulePromise: Promise<typeof import("@excalidraw/excalidraw")> | null = null;
let excalidrawCssPromise: Promise<unknown> | null = null;
const loadExcalidrawModule = async () => {
  // Excalidraw uses window.EXCALIDRAW_ASSET_PATH to resolve runtime font assets.
  // Without this, it falls back to https://esm.sh/... which is blocked by Tauri CSP.
  if (typeof window !== "undefined") {
    if (typeof (window as any).EXCALIDRAW_ASSET_PATH !== "string") {
      try {
        (window as any).EXCALIDRAW_ASSET_PATH = new URL("/excalidraw-assets/", window.location.origin).toString();
      } catch {
        (window as any).EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
      }
    }
  }
  // Load CSS lazily alongside the module so we don't require Excalidraw at app startup.
  excalidrawCssPromise ??= import("@excalidraw/excalidraw/index.css");
  excalidrawModulePromise ??= import("@excalidraw/excalidraw");
  return await excalidrawModulePromise;
};

const blobToImageSize = async (blob: Blob): Promise<{ width: number; height: number }> => {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = url;
    });
    return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
  } finally {
    URL.revokeObjectURL(url);
  }
};

const createSceneFromImageBlob = async (
  blob: Blob,
  theme: "dark" | "light",
): Promise<ExcalidrawInitialDataState> => {
  const { getDataURL, MIME_TYPES } = await loadExcalidrawModule();
  const now = Date.now();
  const fileId = (crypto?.randomUUID?.() || `${now}-${Math.random()}`) as any;
  const dataURL = await getDataURL(blob);
  const { width: naturalWidth, height: naturalHeight } = await blobToImageSize(blob);

  // Scale down very large images so the initial viewport feels sane.
  const maxW = 1200;
  const maxH = 900;
  const scale = Math.min(1, maxW / Math.max(1, naturalWidth), maxH / Math.max(1, naturalHeight));
  const width = Math.round(naturalWidth * scale);
  const height = Math.round(naturalHeight * scale);

  const seed = Math.floor(Math.random() * 2_147_483_647);
  const versionNonce = Math.floor(Math.random() * 2_147_483_647);

  const imageElement: ExcalidrawImageElement = {
    id: crypto?.randomUUID?.() || `${now}-${Math.random()}`,
    type: "image",
    x: 0,
    y: 0,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "hachure",
    strokeWidth: 1,
    strokeStyle: "solid",
    roundness: null,
    roughness: 0,
    opacity: 100,
    width,
    height,
    angle: 0 as any,
    seed,
    version: 1,
    versionNonce,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
    fileId,
    status: "saved",
    scale: [1, 1],
    crop: null,
  };

  const files: BinaryFiles = {
    [fileId]: {
      id: fileId,
      dataURL,
      mimeType: (blob.type as any) || MIME_TYPES.png,
      created: now,
      lastRetrieved: now,
    },
  } as any;

  return {
    elements: [imageElement] as any,
    files,
    appState: {
      viewBackgroundColor: theme === "dark" ? "#121212" : "#ffffff",
      exportBackground: true,
      exportEmbedScene: true,
    } as any,
  };
};

const isEmptyScene = (data: any): boolean => {
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const nonDeleted = elements.filter((e: any) => e && e.isDeleted !== true);
  const files = data?.files && typeof data.files === "object" ? data.files : null;
  const fileCount = files ? Object.keys(files).length : 0;
  return nonDeleted.length === 0 && fileCount === 0;
};

export const ExcalidrawEditorDialog = ({
  title,
  initialBlob,
  initialFileName,
  onSave,
}: ExcalidrawEditorDialogOptions) => {
  const { t } = useTranslation();
  const { theme, resolvedTheme } = useTheme();
  const excalidrawTheme = resolveEditorTheme(theme, resolvedTheme);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [isLoading, setIsLoading] = useState(!!initialBlob);
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const ExcalidrawComponent = useMemo(
    () =>
      React.lazy(async () => {
        const mod = await loadExcalidrawModule();
        return { default: mod.Excalidraw };
      }),
    [],
  );

  const resolvedTitle = title || "Excalidraw";
  const targetFileName = useMemo(() => ensurePngName(initialFileName), [initialFileName]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!initialBlob) {
        setInitialData(null);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const { loadFromBlob } = await loadExcalidrawModule();
        const restored = await loadFromBlob(initialBlob, null, null);
        if (!cancelled) {
          if (isEmptyScene(restored)) {
            const fallback = await createSceneFromImageBlob(initialBlob, excalidrawTheme);
            if (!cancelled) setInitialData(fallback);
          } else {
            setInitialData(restored as any);
          }
        }
      } catch {
        try {
          const fallback = await createSceneFromImageBlob(initialBlob, excalidrawTheme);
          if (!cancelled) {
            setInitialData(fallback);
          }
        } catch (err) {
          console.error("Failed to initialize Excalidraw from image:", err);
          if (!cancelled) {
            setInitialData(null);
            RootStore.Get(ToastPlugin).error(t("unsupported-image-format"));
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [initialBlob, excalidrawTheme]);

  const handleCancel = () => {
    DialogStandaloneStore.close();
  };

  const handleSave = async () => {
    if (!apiRef.current || isSaving) return;
    setIsSaving(true);
    try {
      const { exportToBlob, MIME_TYPES } = await loadExcalidrawModule();
      const elements = apiRef.current.getSceneElements();
      const appState = apiRef.current.getAppState();
      const files = apiRef.current.getFiles();

      const blob = await exportToBlob({
        elements,
        appState: {
          ...appState,
          exportBackground: true,
          exportEmbedScene: true,
        } as any,
        files,
        mimeType: MIME_TYPES.png,
        embedScene: true,
      } as any);

      await onSave({ blob, fileName: targetFileName });
      RootStore.Get(ToastPlugin).success(t("operation-success"));
      DialogStandaloneStore.close();
    } catch (err) {
      console.error("Failed to save Excalidraw image:", err);
      RootStore.Get(ToastPlugin).error(t("operation-failed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full h-[100vh] flex flex-col bg-background text-foreground">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-divider">
        <div className="font-semibold truncate">{resolvedTitle}</div>
        <div className="text-xs opacity-60 truncate">{targetFileName}</div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="light" onPress={handleCancel} isDisabled={isSaving}>
            {t("cancel")}
          </Button>
          <Button color="primary" onPress={handleSave} isLoading={isSaving}>
            {t("save")}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <Icon icon="line-md:loading-twotone-loop" width="28" height="28" />
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="w-full h-full flex items-center justify-center">
                <Icon icon="line-md:loading-twotone-loop" width="28" height="28" />
              </div>
            }
          >
            <div className="w-full h-full">
              <ExcalidrawComponent
                initialData={initialData as any}
                theme={excalidrawTheme}
                excalidrawAPI={(api) => {
                  apiRef.current = api;
                }}
                UIOptions={{
                  canvasActions: {
                    saveToActiveFile: false,
                    loadScene: false,
                    export: false, // we provide our own Save button
                    clearCanvas: true,
                    toggleTheme: false,
                  },
                }}
              />
            </div>
          </Suspense>
        )}
      </div>
    </div>
  );
};

export const showExcalidrawEditorDialog = (opts: ExcalidrawEditorDialogOptions) => {
  DialogStandaloneStore.show({
    isOpen: true,
    title: "",
    onlyContent: true,
    noPadding: true,
    size: "full",
    isDismissable: false,
    content: <ExcalidrawEditorDialog {...opts} />,
  });
};
