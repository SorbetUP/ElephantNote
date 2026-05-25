import { MarkdownRender } from '@/components/Common/MarkdownRender';
import { useMemo, memo } from 'react';
import { FilesAttachmentRender } from "../Common/AttachmentRender";
import { Note } from '@shared/lib/types';
import { BlinkoStore } from '@/store/blinkoStore';
import { observer } from 'mobx-react-lite';
import { ReferencesContent } from './referencesContent';
import { isCredentialsNote, maskCredentialsContent } from '@/lib/notePrivacy';
import { sanitizeBlobLinksWithAttachments } from '@/lib/markdown/sanitizeBlobLinks';
import { deriveNoteAttachments } from '@/lib/markdown/deriveNoteAttachments';

interface NoteContentProps {
  blinkoItem: Note;
  blinko: BlinkoStore;
  isExpanded?: boolean;
  isShareMode?: boolean;
}

export const NoteContent = observer(({ blinkoItem, blinko, isExpanded, isShareMode }: NoteContentProps) => {
  const shouldMask = isCredentialsNote(blinkoItem);
  const baseContent = shouldMask ? maskCredentialsContent(blinkoItem.content ?? '') : (blinkoItem.content ?? '');
  const derivedAttachments = useMemo(() => {
    if (shouldMask) return [];
    return deriveNoteAttachments({
      content: baseContent,
      attachments: (blinkoItem.attachments ?? []) as any,
      noteId: blinkoItem.id ?? undefined,
    }) as any;
  }, [baseContent, blinkoItem.attachments, blinkoItem.id, shouldMask]);

  // Never render ephemeral blob links when we can resolve them from note attachments.
  // This is display-only; persistence is handled in the editor/send path.
  const renderContent = shouldMask
    ? baseContent
    : sanitizeBlobLinksWithAttachments(baseContent, derivedAttachments as any);

  return (
    <>
      <MarkdownRender
        content={renderContent}
        onChange={
          shouldMask
            ? undefined
            : (newContent) => {
              if (isShareMode) return;
              blinkoItem.content = newContent
              blinko.upsertNote.call({ id: blinkoItem.id, content: newContent, refresh: false })
            }
        }
        isShareMode={isShareMode}
        largeSpacing={isShareMode || isExpanded}
      />
      {!shouldMask && (
        <>
          <ReferencesContent blinkoItem={blinkoItem} className={`${isExpanded ? 'my-4' : 'my-2'}`} />
          <div className={derivedAttachments.length != 0 ? 'my-2' : ''}>
            <FilesAttachmentRender
              files={derivedAttachments as any}
              preview
              noteId={blinkoItem.id ?? undefined}
              noteContent={blinkoItem.content ?? ""}
              noteAttachments={derivedAttachments as any}
            />
          </div>
        </>
      )}
    </>
  );
});
