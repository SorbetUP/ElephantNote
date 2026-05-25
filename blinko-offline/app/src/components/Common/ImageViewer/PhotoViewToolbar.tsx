import { useCallback, useMemo } from "react";
import type { OverlayRenderProps } from "react-photo-view/dist/types";

import { Icon } from "@/components/Common/Iconify/icons";
import { isAndroid, isInTauri } from "@/lib/tauriHelper";

type PhotoViewToolbarProps = {
  overlayProps: OverlayRenderProps;
  onEdit?: () => Promise<void> | void;
  onDownload?: () => Promise<void> | void;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function PhotoViewToolbar({ overlayProps, onEdit, onDownload }: PhotoViewToolbarProps) {
  const canEdit = typeof onEdit === "function";
  const canDownload = typeof onDownload === "function";

  const zoomIn = useCallback(() => {
    overlayProps.onScale(clamp(Number((overlayProps.scale + 0.25).toFixed(2)), 0.5, 6));
  }, [overlayProps]);

  const zoomOut = useCallback(() => {
    overlayProps.onScale(clamp(Number((overlayProps.scale - 0.25).toFixed(2)), 0.5, 6));
  }, [overlayProps]);

  const rotateLeft = useCallback(() => {
    overlayProps.onRotate(((overlayProps.rotate - 90 + 360) % 360) as any);
  }, [overlayProps]);

  const rotateRight = useCallback(() => {
    overlayProps.onRotate(((overlayProps.rotate + 90) % 360) as any);
  }, [overlayProps]);

  const reset = useCallback(() => {
    overlayProps.onScale(1);
    overlayProps.onRotate(0);
  }, [overlayProps]);

  const close = useCallback(() => overlayProps.onClose(), [overlayProps]);

  const handleEdit = useCallback(() => {
    if (!canEdit) return;
    overlayProps.onClose();
    requestAnimationFrame(() => {
      setTimeout(() => {
        void onEdit?.();
      }, 0);
    });
  }, [canEdit, onEdit, overlayProps]);

  const handleDownload = useCallback(() => {
    if (!canDownload) return;
    void onDownload?.();
  }, [canDownload, onDownload]);

  const iconSize = useMemo(() => (isInTauri() && isAndroid() ? 22 : 20), []);

  return (
    <div className="flex items-center gap-2 select-none">
      <div className="PhotoView-Slider__toolbarIcon" title="Rotate left" onClick={rotateLeft}>
        <Icon icon="tabler:rotate-2" width={iconSize} height={iconSize} />
      </div>
      <div className="PhotoView-Slider__toolbarIcon" title="Rotate right" onClick={rotateRight}>
        <Icon icon="tabler:rotate-clockwise-2" width={iconSize} height={iconSize} />
      </div>
      <div className="PhotoView-Slider__toolbarIcon" title="Zoom out" onClick={zoomOut}>
        <Icon icon="tabler:zoom-out" width={iconSize} height={iconSize} />
      </div>
      <div className="PhotoView-Slider__toolbarIcon" title="Zoom in" onClick={zoomIn}>
        <Icon icon="tabler:zoom-in" width={iconSize} height={iconSize} />
      </div>
      <div className="PhotoView-Slider__toolbarIcon" title="Reset" onClick={reset}>
        <Icon icon="tabler:refresh" width={iconSize} height={iconSize} />
      </div>

      {canDownload && (
        <div className="PhotoView-Slider__toolbarIcon" title="Download" onClick={handleDownload}>
          <Icon icon="tabler:download" width={iconSize} height={iconSize} />
        </div>
      )}

      {canEdit && (
        <div className="PhotoView-Slider__toolbarIcon" title="Edit with Excalidraw" onClick={handleEdit}>
          <Icon icon="simple-icons:excalidraw" width={iconSize} height={iconSize} />
        </div>
      )}

      <div className="PhotoView-Slider__toolbarIcon" title="Close" onClick={close}>
        <Icon icon="tabler:x" width={iconSize} height={iconSize} />
      </div>
    </div>
  );
}
