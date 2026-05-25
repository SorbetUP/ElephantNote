import { useEffect, useState, useRef } from 'react';
import { Card, Image, Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { api } from '@/lib/trpc';
import { LinkInfo } from '@shared/lib/types';
import { RootStore } from '@/store';
import { StorageState } from '@/store/standard/StorageState';
import { observer } from 'mobx-react-lite';
import { isInTauri, openFromLinkInDefaultApp } from '@/lib/tauriHelper';

const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'doc', 'docx',
  'xls', 'xlsx',
  'ppt', 'pptx',
  'odt', 'ods', 'odp',
  'rtf',
  'txt',
  'csv',
]);

function isDocumentHref(href: string): boolean {
  try {
    const url = new URL(href, window.location.origin);
    const last = (url.pathname.split('/').pop() || '').toLowerCase();
    const dot = last.lastIndexOf('.');
    if (dot < 0) return false;
    const ext = last.slice(dot + 1);
    return DOCUMENT_EXTENSIONS.has(ext);
  } catch {
    const clean = (href || '').split('#')[0].split('?')[0].toLowerCase();
    const last = clean.split('/').pop() || '';
    const dot = last.lastIndexOf('.');
    if (dot < 0) return false;
    const ext = last.slice(dot + 1);
    return DOCUMENT_EXTENSIONS.has(ext);
  }
}

interface LinkPreviewProps {
  href: string;
  text: any;
  isBlock?: boolean;
}

function isEphemeralBlobHref(href: string): boolean {
  return (href || '').trim().toLowerCase().startsWith('blob:');
}

export const LinkPreview = observer(({ href, text, isBlock = false }: LinkPreviewProps) => {
  const store = RootStore.Local(() => ({
    previewData: new StorageState<LinkInfo | null>({ key: href, default: null })
  }))
  
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isBlobHref = isEphemeralBlobHref(href);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 300);
  };
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!store.previewData.value) {
          const info = await api.public.linkPreview.query({ url: href }, { context: { skipBatch: true } })
          store.previewData.setValue(info)
        }
      } catch (error) {
        console.error('Error fetching preview data:', error);
      }
    };
    // Only fetch if it's a block or popover is open (to save resources)
    if (!isBlobHref && (isBlock || isOpen)) {
      fetchData();
    }
  }, [href, isBlock, isOpen]);

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBlobHref) {
      // `blob:` links are ephemeral (session-bound). Opening them can navigate away from the app
      // and strand the user on a blank/broken viewer page in Tauri/WebView.
      e.preventDefault();
      return;
    }
    if (isInTauri() && isDocumentHref(href)) {
      openFromLinkInDefaultApp(href);
      return;
    }
    window.open(href, '_blank');
  };

  const PreviewCard = () => {
    if (!store.previewData?.value?.title) return null;
    
    return (
      <div 
        onClick={handleCardClick} 
        className='p-2 my-1 bg-secondbackground rounded-xl select-none cursor-pointer hover:bg-default-100 transition-colors max-w-md'
      >
        <div className='flex items-center gap-2 w-full'>
          <div className='font-bold truncate text-sm'>{store.previewData.value?.title}</div>
          {store.previewData.value?.favicon && 
            <Image 
              fallbackSrc="/fallback.png" 
              className='flex-1 rounded-full ml-auto min-w-[16px]' 
              src={store.previewData.value.favicon} 
              width={16} 
              height={16}
            />
          }
        </div>
        <div className='text-desc truncate text-xs mt-1'>{store.previewData.value?.description}</div>
      </div>
    );
  };

  if (isBlobHref) {
    return (
      <span
        className="text-desc underline decoration-dotted cursor-not-allowed"
        title="Temporary link (blob:) is not supported. Re-insert the attachment after upload."
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        {text}
      </span>
    );
  }

  if (isBlock) {
    return (
      <div className="link-preview-block w-full my-2">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline block mb-1 truncate"
          onClick={(e) => {
            e.stopPropagation();
            if (isInTauri() && isDocumentHref(href)) {
              e.preventDefault();
              openFromLinkInDefaultApp(href);
            }
          }}
        >
          {text}
        </a>
        <PreviewCard />
      </div>
    );
  }

  return (
    <Popover 
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      placement="bottom" 
      triggerScaleOnOpen={false} 
    >
      <PopoverTrigger>
        <a 
          href={href} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-primary hover:underline inline-block cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            if (isInTauri() && isDocumentHref(href)) {
              e.preventDefault();
              openFromLinkInDefaultApp(href);
            }
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {text}
        </a>
      </PopoverTrigger>
      <PopoverContent 
        className="p-0 bg-transparent border-none shadow-none"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {store.previewData?.value?.title ? (
          <div className="shadow-lg rounded-xl overflow-hidden bg-background border border-default-200">
            <PreviewCard />
          </div>
        ) : (
          <div className="p-2 text-xs text-default-500 bg-background border border-default-200 rounded-md shadow-sm">Loading preview...</div>
        )}
      </PopoverContent>
    </Popover>
  );
}); 
