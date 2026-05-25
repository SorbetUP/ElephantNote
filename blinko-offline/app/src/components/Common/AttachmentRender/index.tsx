import { useEffect, useMemo, useState } from 'react';
import { FileIcons } from './FileIcon';
import { observer } from 'mobx-react-lite';
import { helper } from '@/lib/helper';
import { type Attachment } from '@shared/lib/types';
import { FileType } from '../Editor/type';
import { DeleteIcon, DownloadIcon } from './icons';
import { ImageRender } from './imageRender';
import { HandleFileType } from '../Editor/editorUtils';
import { Icon } from '@/components/Common/Iconify/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@heroui/popover';
import { BlinkoCard } from '@/components/BlinkoCard';
import { EditorStore } from '../Editor/editorStore';
import { DraggableFileGrid } from './DraggableFileGrid';
import { AudioRender } from './audioRender';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';
import { openFromLinkInDefaultApp } from '@/lib/tauriHelper';
import { useTranslation } from 'react-i18next';
import { eventBus } from '@/lib/event';
import { extractApiFileRefsFromMarkdown } from '@/lib/markdown/extractApiFileAttachments';

//https://www.npmjs.com/package/browser-thumbnail-generator

type IProps = {
  files: FileType[]
  preview?: boolean
  columns?: number
  onReorder?: (newFiles: FileType[]) => void
  noteId?: number
  noteContent?: string
  noteAttachments?: Attachment[]
}

const AttachmentsRender = observer((props: IProps) => {
  const { files, preview = false, columns = 3, noteContent, noteId } = props
  const { t } = useTranslation()
  const [showUsed, setShowUsed] = useState(false);

  useEffect(() => {
    if (!noteId) return;

    const handler = (payload: any) => {
      if (!payload || payload.noteId !== noteId) return;
      if (typeof payload.showUsed !== 'boolean') return;
      setShowUsed(payload.showUsed);
    };

    eventBus.on('attachments:setShowUsed', handler);
    return () => {
      eventBus.off('attachments:setShowUsed', handler);
    };
  }, [noteId]);

  const usedFileNames = useMemo(() => {
    const out = new Set<string>();
    const content = noteContent ?? '';
    if (!content) return out;
    const usedRefs = extractApiFileRefsFromMarkdown(content);
    const usedIds = new Set(usedRefs.map(ref => ref.id));

    for (const f of files ?? []) {
      const candidates = [(f as any)?.uploadPromise?.value, (f as any)?.preview]
        .filter((x) => typeof x === 'string' && x.length > 0) as string[];
      const stable = candidates.filter((x) => !x.startsWith('blob:') && !x.startsWith('data:'));
      if (stable.length === 0) continue;

      // The editor typically stores relative `/api/...` paths, but be defensive and also match the absolute endpoint form.
      const matchesByText = stable.some((raw) => content.includes(raw) || content.includes(getBlinkoEndpoint(raw)));
      const matchesById = stable.some((raw) => {
        const id = raw.match(/\/api\/file\/(\d+)\b/)?.[1];
        return id ? usedIds.has(id) : false;
      });
      const matches = matchesByText || matchesById;
      if (matches && typeof f?.name === 'string') out.add(f.name);
    }
    return out;
  }, [files, noteContent]);

  const hiddenFileNames = useMemo(() => {
    if (showUsed) return new Set<string>();
    return usedFileNames;
  }, [showUsed, usedFileNames]);

  const hiddenCount = usedFileNames.size;
  const dragDisabled = hiddenFileNames.size > 0;

  const gridClassName = preview 
    ? `grid grid-cols-${(columns - 1) < 1 ? 1 : (columns - 1)} md:grid-cols-${columns} gap-2` 
    : 'flex flex-row gap-2 overflow-x-auto pb-2';

  return (
    <div className={`flex flex-col ${files.length == 0 ? 'gap-[2px]' : 'gap-[4px]'}`}>
      {/* In preview (note card), the toggle is rendered in the card footer next to "Blinko". */}
      {hiddenCount > 0 && (!preview || !noteId) && (
        <div className="flex items-center gap-2 text-xs opacity-70">
          <button
            type="button"
            className="underline hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              setShowUsed((v) => !v);
            }}
          >
            {showUsed
              ? t('hide-used-attachments', { count: hiddenCount })
              : t('show-used-attachments', { count: hiddenCount })}
          </button>
        </div>
      )}

      {/* image render */}
      <ImageRender {...props} hiddenFileNames={hiddenFileNames} dragDisabled={dragDisabled} />

      {/* video render  */}
      <div className="columns-1 md:columns-1">
        {files
          ?.filter((i) => i.previewType === 'video' && !hiddenFileNames.has(i.name))
          .map((file, index) => {
          // Add token to video URL for authentication
          let videoUrl = getBlinkoEndpoint(file.preview);
          const token = RootStore.Get(UserStore).tokenData?.value?.token;
          if (token) {
            videoUrl = `${videoUrl}?token=${token}`;
          }
          
          return (
            <div
              key={`${file.name}-${index}`}
              className='group relative flex p-2 items-center gap-2 cursor-pointer !transition-all rounded-2xl'
            >
              <video
                onDoubleClick={(e) => e.stopPropagation()}
                src={videoUrl}
                id="player"
                playsInline
                controls
                className='rounded-2xl w-full z-0 max-h-[150px]'
              />
              {!file.uploadPromise?.loading?.value && !preview &&
                <DeleteIcon className='absolute z-10 right-[5px] top-[5px]' files={files} file={file} />
              }
              {preview && <DownloadIcon className='top-[8px] right-[8px]' file={file} />}
            </div>
          );
        })}
      </div>

      {/* audio render */}
      <AudioRender files={files} preview={preview} hiddenFileNames={hiddenFileNames} />

      {/* other file render */}
      <DraggableFileGrid
        files={files.filter((f) => f.previewType !== 'other' || !hiddenFileNames.has(f.name))}
        preview={preview}
        dragDisabled={dragDisabled}
        type="other"
        className={gridClassName}
        onReorder={props.onReorder}
        renderItem={(file) => (
          <div 
            className={`relative mt-2 flex p-2 items-center gap-2 cursor-pointer 
              bg-secondbackground hover:bg-hover !transition-all rounded-md group
              ${!preview ? 'min-w-[200px] flex-shrink-0' : 'w-full'}`}
            onClick={(e) => {
              e.stopPropagation();
              if (preview) {
                const uri = file.uploadPromise.value || file.preview;
                openFromLinkInDefaultApp(uri, file.name);
              }
            }}
          >
            <FileIcons path={file.name} isLoading={file.uploadPromise?.loading?.value} />
            <div className='truncate text-xs md:text-sm font-bold'>{file.name}</div>
            {!file.uploadPromise?.loading?.value && !preview &&
              <DeleteIcon className='ml-auto group-hover:opacity-100 opacity-0' files={files} file={file} />
            }
          </div>
        )}
      />
    </div>
  )
})

const FilesAttachmentRender = observer(({
  files,
  preview,
  columns,
  onReorder,
  noteId,
  noteContent,
  noteAttachments
}: {
  files: Attachment[],
  preview?: boolean,
  columns?: number,
  onReorder?: (newFiles: Attachment[]) => void,
  noteId?: number,
  noteContent?: string,
  noteAttachments?: Attachment[]
}) => {
  const [handledFiles, setFiles] = useState<FileType[]>([]);

  useEffect(() => {
    setFiles(HandleFileType(files));
  }, [files]);

  const handleReorder = (newFiles: FileType[]) => {
    const newAttachments = files.slice().sort((a, b) => {
      const aIndex = newFiles.findIndex(f => f.name === a.name);
      const bIndex = newFiles.findIndex(f => f.name === b.name);
      return aIndex - bIndex;
    });
    onReorder?.(newAttachments);
  };

  return (
    <AttachmentsRender
      files={handledFiles}
      preview={preview}
      columns={columns}
      onReorder={handleReorder}
      noteId={noteId}
      noteContent={noteContent}
      noteAttachments={noteAttachments}
    />
  );
});


const ReferenceRender = observer(({ store }: { store: EditorStore }) => {
  return <div className='grid grid-cols-2 md:grid-cols-3 gap-2'>
    {
      store?.currentReferences?.map(i => {
        return <Popover placement="bottom">
          <PopoverTrigger>
            <div className="flex items-center gap-1 blinko-tag cursor-pointer hover:opacity-80 group">
              <Icon className="min-w-[20px] max-w-[20px] !text-primary" icon="uim:arrow-up-left" width="20" height="20" />
              <div className="truncate">{i.content}</div>
              <div onClick={(e) => {
                e.stopPropagation()
                store.noteListByIds.value = store.noteListByIds.value?.filter(t => i.id !== t.id)
                store.deleteReference(i.id)
              }} className={`group-hover:opacity-100 md:opacity-0 hover:opacity-100 cursor-pointer rounded-sm transition-al ml-auto`}>
                <Icon icon="basil:cross-solid" width={20} height={20} />
              </div>
            </div>
          </PopoverTrigger>
          <PopoverContent className='max-w-[300px]'>
            <div className="px-1 py-2 max-w-[300px]" >
              <BlinkoCard blinkoItem={i} />
            </div>
          </PopoverContent>
        </Popover>
      })
    }
  </div>
})

export { AttachmentsRender, FilesAttachmentRender, ReferenceRender }
