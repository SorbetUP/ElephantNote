import { showExcalidrawEditorDialog } from "@/components/Common/Excalidraw/ExcalidrawEditorDialog";
import { useTranslation } from "react-i18next";
import { IconButton } from "../IconButton";
import { useRef } from "react";

export const ExcalidrawButton = ({ onFileUpload }: { onFileUpload: (files: File[]) => Promise<any> | void }) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          // Allow picking the same file again later.
          e.target.value = "";
          if (!file) return;

          const initialBlob = file.slice(0, file.size, file.type || "image/png");
          showExcalidrawEditorDialog({
            title: "Excalidraw",
            initialBlob,
            initialFileName: file.name || `excalidraw-${Date.now()}.png`,
            onSave: async ({ blob, fileName }) => {
              const next = new File([blob], fileName, { type: blob.type || "image/png" });
              await onFileUpload([next]);
            },
          });
        }}
      />

      <IconButton
        icon="simple-icons:excalidraw"
        tooltip="new-excalidraw-drawing"
        onClick={(e) => {
          e?.stopPropagation?.();
          showExcalidrawEditorDialog({
            title: "Excalidraw",
            initialFileName: `excalidraw-${Date.now()}.png`,
            onSave: async ({ blob, fileName }) => {
              const file = new File([blob], fileName, { type: blob.type || "image/png" });
              await onFileUpload([file]);
            },
          });
        }}
      />

      <IconButton
        icon="material-symbols:image-outline"
        tooltip="excalidraw-import-image"
        onClick={(e) => {
          e?.stopPropagation?.();
          inputRef.current?.click();
        }}
      />
    </>
  );
};
