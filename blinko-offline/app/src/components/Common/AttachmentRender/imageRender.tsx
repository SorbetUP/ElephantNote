import { useEffect, useMemo, useState, type MouseEvent, type PointerEvent } from 'react';
import { FileType } from '../Editor/type';
import { Image } from '@heroui/react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import { Icon } from '@/components/Common/Iconify/icons';
import { DeleteIcon, DownloadIcon, InsertConextButton, CopyIcon } from './icons';
import { observer } from 'mobx-react-lite';
import { DraggableFileGrid } from './DraggableFileGrid';
import axiosInstance from '@/lib/axios';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';
import { showExcalidrawEditorDialog } from '@/components/Common/Excalidraw/ExcalidrawEditorDialog';
import { BlinkoStore } from '@/store/blinkoStore';
import { helper } from '@/lib/helper';
import type { Attachment } from '@shared/lib/types';
import { useTranslation } from 'react-i18next';
import { isBlobLikeUrl, appendQueryParam } from '@/lib/media/protectedApiImages';
import { eventBus } from '@/lib/event';
import { PhotoViewToolbar } from '@/components/Common/ImageViewer/PhotoViewToolbar';
import { downloadFromLink } from '@/lib/tauriHelper';

type IProps = {
  files: FileType[]
  preview?: boolean
  columns?: number
  onReorder?: (newFiles: FileType[]) => void
  noteId?: number
  noteContent?: string
  noteAttachments?: Attachment[]
  hiddenFileNames?: Set<string>
  dragDisabled?: boolean
}

export const ImageThumbnailRender = ({ src, className }: { src: string, className?: string }) => {
  const [isOriginalError, setIsOriginalError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl = '';

    const fetchImage = async () => {
      setLoading(true);

      // blob: URLs can't be fetched with XHR/fetch reliably in Tauri WebView and
      // must not be modified with query params (CSP/connect-src errors).
      if (isBlobLikeUrl(src)) {
        setCurrentSrc(src);
        setLoading(false);
        return;
      }

      try {
        // Try to get thumbnail first
        const baseUrl = getBlinkoEndpoint(src);
        const thumbnailUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}thumbnail=true`;
        const response = await axiosInstance.get(thumbnailUrl, {
          responseType: 'blob'
        });

        objectUrl = URL.createObjectURL(response.data);
        setCurrentSrc(objectUrl);
      } catch (error) {
        try {
          // If thumbnail fails, try original image
          const response = await axiosInstance.get(getBlinkoEndpoint(src), {
            responseType: 'blob'
          });

          objectUrl = URL.createObjectURL(response.data);
          setCurrentSrc(objectUrl);
        } catch (error) {
          // If both fail, use fallback
          setIsOriginalError(true);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchImage();

    // Clean up created object URLs when component unmounts
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  useEffect(() => {
    if (isOriginalError) {
      setCurrentSrc('/image-fallback.svg')
    }
  }, [isOriginalError])

  return (
    <>
      {loading && (
        <div className="flex items-center justify-center w-full h-full">
          <Icon icon="line-md:loading-twotone-loop" width="24" height="24" />
        </div>
      )}
      {!loading && (
        <Image
          src={currentSrc}
          classNames={{
            wrapper: '!max-w-full',
          }}
          draggable={false}
          onError={() => {
            setIsOriginalError(true);
          }}
          className={`object-cover w-full ${className}`}
        />
      )}
    </>
  );
}

const ImageRender = observer((props: IProps) => {
  const { files, preview = false, columns, noteId, noteContent, noteAttachments, hiddenFileNames, dragDisabled = false } = props
  const { t } = useTranslation()
  const [imageVersion, setImageVersion] = useState(0); // Force re-render when Excalidraw image updated

  const normalizeAttachmentPath = (src: string): string => {
    const raw = (src || '').trim();
    if (!raw) return '';
    const strip = (v: string) => v.split('?')[0]!.split('#')[0]!;
    if (raw.startsWith('/api/file/')) return strip(raw);
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      try {
        const u = new URL(raw);
        if (u.pathname.startsWith('/api/file/')) return strip(u.pathname);
      } catch {
        // ignore
      }
    }
    return '';
  };

  const stopCardClick = (e: MouseEvent | PointerEvent) => {
    // Prevent BlinkoCard click handler from opening the note when users intended to preview the image.
    e.stopPropagation();
  };

  const getCacheBust = (file: FileType): number | undefined => (file as any).__cacheBust;

  const maybeCacheBust = (url: string, file: FileType) => {
    const bust = getCacheBust(file);
    if (!bust) return url;
    if (url.includes('v=')) return url;
    return appendQueryParam(url, 'v', String(bust));
  };

  const getThumbSrc = (file: FileType) => {
    const raw = (file.preview || file.uploadPromise?.value) as any;
    if (!raw || typeof raw !== 'string') return '';
    if (isBlobLikeUrl(raw)) return raw;
    return maybeCacheBust(raw, file);
  };

  const getPhotoViewSrc = (file: FileType) => {
    const raw = (file.uploadPromise?.value || file.preview) as any;
    if (!raw || typeof raw !== 'string') return '';

    if (isBlobLikeUrl(raw)) return raw;

    let baseUrl = getBlinkoEndpoint(raw);
    baseUrl = maybeCacheBust(baseUrl, file);
    const token = RootStore.Get(UserStore).tokenData.value?.token;
    if (token && !baseUrl.includes('token=')) {
      return appendQueryParam(baseUrl, 'token', token);
    }
    return baseUrl;
  };

  const uploadImageBlob = async (blob: Blob, fileName: string) => {
    const formData = new FormData();
    const file = new File([blob], fileName, { type: blob.type || 'image/png' });
    formData.append('file', file);

    const response = await axiosInstance.post(getBlinkoEndpoint('/api/file/upload'), formData);
    return response.data as { filePath: string; fileName?: string; type?: string; size?: number };
  };

  const overwriteImageBlob = async (blob: Blob, fileName: string, attachmentPath: string) => {
    const formData = new FormData();
    const file = new File([blob], fileName, { type: blob.type || 'image/png' });
    formData.append('file', file);
    formData.append('attachment_path', attachmentPath);

    const response = await axiosInstance.post(getBlinkoEndpoint('/api/file/overwrite'), formData);
    return response.data as { filePath: string; fileName?: string; type?: string; size?: number };
  };

  const deleteRemoteAttachment = async (attachmentPath: string) => {
    if (!attachmentPath?.startsWith('/api/')) return;
    await axiosInstance.post(getBlinkoEndpoint('/api/file/delete'), { attachment_path: attachmentPath });
  };

  const loadBlobFromSrc = async (src: string): Promise<Blob> => {
    if (src.startsWith('blob:')) {
      const res = await fetch(src);
      return await res.blob();
    }
    const res = await axiosInstance.get(getBlinkoEndpoint(src), { responseType: 'blob' });
    return res.data as Blob;
  };

  const replaceInBlinkoAttachmentStorages = (oldPath: string, next: { name: string; path: string; type: string; size: number }) => {
    const blinko = RootStore.Get(BlinkoStore);

    const replaceIn = (list: any[]) => {
      const idx = list.findIndex((x) => x?.path === oldPath);
      if (idx === -1) return false;
      list[idx] = { ...list[idx], ...next };
      return true;
    };

    const didCreate = replaceIn(blinko.createAttachmentsStorage.list);
    if (didCreate) {
      blinko.createAttachmentsStorage.save(blinko.createAttachmentsStorage.list);
      blinko.updateTicker++;
      return;
    }

    const didEdit = replaceIn(blinko.editAttachmentsStorage.list);
    if (didEdit) {
      blinko.editAttachmentsStorage.save(blinko.editAttachmentsStorage.list);
      blinko.updateTicker++;
    }
  };

  const imageRenderClassName = useMemo(() => {
    if (!preview) {
      return 'flex flex-row gap-2 overflow-x-auto pb-2'
    }
    return 'flex flex-wrap gap-2'
  }, [preview, columns])

  const displayFiles = useMemo(() => {
    if (!hiddenFileNames || hiddenFileNames.size === 0) return files;
    // Keep the original `files` array for mutations (delete), but hide selected items in the UI.
    return files.filter((f) => !(f?.previewType === 'image' && hiddenFileNames.has(f.name)));
  }, [files, hiddenFileNames]);

  const imageHeight = useMemo(() => {
    if (!preview) {
      return 'h-[160px] w-[160px]'
    }
    return 'md:h-[180px] md:w-[180px] h-[100px] w-[100px] object-cover'
  }, [preview, columns])

  const renderImage = (file: FileType) => (
    <div className={`relative group ${!preview ? 'min-w-[160px] flex-shrink-0' : ''} ${imageHeight}`}>
      {file.uploadPromise?.loading?.value && (
        <div className='absolute inset-0 flex items-center justify-center w-full h-full'>
          <Icon icon="line-md:uploading-loop" width="40" height="40" />
        </div>
      )}
      <div className='w-full'>
        <PhotoView
          key={`${file.uploadPromise?.value || file.preview || file.name}-${getCacheBust(file) || imageVersion}`}
          src={getPhotoViewSrc(file)}
          overlay={file.uploadPromise?.value || file.preview}
        >
          <div onClick={stopCardClick} onPointerDown={stopCardClick}>
            <ImageThumbnailRender
              src={getThumbSrc(file)}
              className={`mb-4 ${imageHeight} object-cover md:w-[1000px]`}
            />
          </div>
        </PhotoView>
      </div>
      {!file.uploadPromise?.loading?.value && !preview &&
        <InsertConextButton className='absolute z-10 left-[5px] top-[5px]' files={files} file={file} />
      }
      {!file.uploadPromise?.loading?.value && !preview &&
        <DeleteIcon className='absolute z-10 right-[5px] top-[5px]' files={files} file={file} />
      }
      {preview && (
        <>
          <CopyIcon file={file} />
          <DownloadIcon file={file} />
        </>
      )}
    </div>
  )

  return (
    <PhotoProvider
      toolbarRender={(overlayProps) => {
        // Prefer using index when available to avoid brittle matching when URLs get cache-busted.
        const idx = (overlayProps as any)?.index;
        const imageFiles = displayFiles.filter((f) => f.previewType === 'image');
        const currentFile =
          typeof idx === 'number'
            ? imageFiles[idx]
            : (() => {
                const overlay = (overlayProps as any)?.overlay;
                const currentSrc = typeof overlay === 'string' ? overlay : '';
                return currentSrc ? displayFiles.find((f) => (f.uploadPromise?.value || f.preview) === currentSrc) : undefined;
              })();

        if (!currentFile) return null;
        if (currentFile.uploadPromise?.loading?.value) return null;

        const src = currentFile.uploadPromise?.value || currentFile.preview;
        if (!src) return null;

        // If this is a remote file, require auth (shared notes are read-only anyway).
        const token = RootStore.Get(UserStore).tokenData.value?.token;
        if (!token && typeof src === 'string' && !src.startsWith('blob:')) return null;

        const canDownload = typeof src === 'string' && !isBlobLikeUrl(src);

        return (
          <PhotoViewToolbar
            overlayProps={overlayProps as any}
            onDownload={
              canDownload
                ? async () => {
                    await downloadFromLink(src, currentFile.name);
                  }
                : undefined
            }
            onEdit={async () => {
              try {
                const initialBlob = await loadBlobFromSrc(src);

                showExcalidrawEditorDialog({
                  title: 'Excalidraw',
                  initialBlob,
                  initialFileName: currentFile.name,
                  onSave: async ({ blob }) => {
                    const oldPath =
                      normalizeAttachmentPath(currentFile.uploadPromise?.value || '') ||
                      (typeof src === 'string' ? normalizeAttachmentPath(src) : '');

                    // Keep the original file name to preserve attachments order behavior (sorting uses name).
                    const nextFileName = currentFile.name || 'excalidraw.png';

                    // If we can, overwrite the existing attachment in place to avoid duplicating attachments on the note.
                    if (oldPath) {
                      const updated = await overwriteImageBlob(blob, nextFileName, oldPath);
                      const nextType = updated.type || 'image/png';
                      const nextSize = Number(updated.size || blob.size || 0);

                      // bust caches in the viewer without changing stored attachment path
                      (currentFile as any).__cacheBust = Date.now();

                      // Update local UI representation (path stays the same).
                      currentFile.type = nextType;
                      currentFile.size = nextSize;
                      currentFile.extension = helper.getFileExtension(nextFileName) ?? currentFile.extension;
                      await currentFile.uploadPromise?.setValue(oldPath);

                      // Update local note object so UI reflects immediately.
                      if (noteAttachments) {
                        const att = noteAttachments.find((a) => a.path === oldPath);
                        if (att) {
                          // @ts-ignore
                          att.size = nextSize;
                          // @ts-ignore
                          att.type = nextType;
                          // @ts-ignore - Force re-render by updating cache bust on attachment too
                          att.__cacheBust = Date.now();
                        }
                      }

                      // Force UI re-render to show updated image immediately
                      setImageVersion((v) => v + 1);

                      const blinko = RootStore.Get(BlinkoStore);
                      blinko.updateTicker++;

                      // Notify other components (e.g., markdown images) that this image was updated
                      eventBus.emit('image:updated', oldPath);

                      return;
                    }

                    // Fallback: upload a new attachment and replace references in local UI (no note DB attach here).
                    const uploaded = await uploadImageBlob(blob, nextFileName);
                    const nextPath = uploaded.filePath;
                    const nextType = uploaded.type || 'image/png';
                    const nextSize = Number(uploaded.size || blob.size || 0);

                    // Update local editor storage so send uses the new file.
                    const normalizedSrc = typeof src === 'string' ? normalizeAttachmentPath(src) : '';
                    if (normalizedSrc) {
                      replaceInBlinkoAttachmentStorages(normalizedSrc, {
                        name: nextFileName,
                        path: nextPath,
                        type: nextType,
                        size: nextSize,
                      });
                      await deleteRemoteAttachment(normalizedSrc);
                    }

                    currentFile.preview = nextPath;
                    currentFile.type = nextType;
                    currentFile.size = nextSize;
                    currentFile.extension = helper.getFileExtension(nextFileName) ?? currentFile.extension;
                    await currentFile.uploadPromise?.setValue(nextPath);
                  },
                });
              } catch (err) {
                console.error('Failed to open Excalidraw editor:', err);
              }
            }}
          />
        );
      }}
    >
      <DraggableFileGrid
        files={displayFiles}
        preview={preview}
        dragDisabled={dragDisabled}
        columns={columns}
        type="image"
        className={imageRenderClassName}
        renderItem={renderImage}
        onReorder={props.onReorder}
      />
    </PhotoProvider>
  )
})

export { ImageRender }
