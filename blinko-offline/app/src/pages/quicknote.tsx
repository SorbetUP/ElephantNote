import { observer } from "mobx-react-lite";
import { BlinkoEditor } from "@/components/BlinkoEditor";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { useEffect, useRef } from "react";
import { isInTauri } from "@/lib/tauriHelper";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/Common/Iconify/icons";

const QuickNotePage = observer(() => {
  const blinko = RootStore.Get(BlinkoStore);
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef<number>(0);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const closeQuicknote = async () => {
    if (!isInTauri()) return;
    try {
      await invoke('toggle_quicknote_window');
    } catch (error) {
      console.error('Failed to toggle quicknote window:', error);
    }
  };

  // Detect container height and resize window with debouncing
  const checkAndResizeWindow = async () => {
    if (!isInTauri() || !containerRef.current) return;

    const height = containerRef.current.scrollHeight;

    // Skip adjustment if height hasn't changed significantly
    if (Math.abs(height - lastHeightRef.current) < 5) {
      return;
    }

    if (height > 0 && height !== lastHeightRef.current) {
      try {
        console.log(`Attempting to resize window: ${lastHeightRef.current} -> ${height}`);
        await invoke('resize_quicknote_window', { height});
        lastHeightRef.current = height;
      } catch (error) {
        console.error('Failed to resize window:', error);
      }
    }
  };

  // Debounced version of resize function
  const debouncedResize = () => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    resizeTimeoutRef.current = setTimeout(() => {
      checkAndResizeWindow();
    }, 100);
  };

  useEffect(() => {
    // Ensure in create mode
    blinko.isCreateMode = true;

    // Disable auto navigation - quicknote window should not navigate
    const originalNavigate = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    // Override history API to prevent navigation
    window.history.pushState = function () {
      console.log('Navigation blocked in quicknote window');
      return;
    };

    window.history.replaceState = function () {
      console.log('Navigation blocked in quicknote window');
      return;
    };

    // Set page title
    if (isInTauri()) {
      document.title = t('quicknote.title');
    }

    // Set body overflow to hidden for full-height layout
    document.body.style.overflow = 'hidden';

    // Auto focus to editor
    const timer = setTimeout(() => {
      // Ensure the quicknote window is focused (desktop only).
      // (Tauri: avoids keystrokes going to the previous focused window)
      try {
        getCurrentWebviewWindow().setFocus();
      } catch {
        // ignore
      }

      const editorElement = document.getElementById('quicknote-editor');
      if (editorElement) {
        const textArea = editorElement.querySelector('textarea');
        const contentEditable = editorElement.querySelector('[contenteditable="true"]');

        if (textArea) {
          textArea.focus();
        } else if (contentEditable) {
          (contentEditable as HTMLElement).focus();
        } else {
          editorElement.focus();
        }
      }
    }, 100);

    // Initial window size check
    const initialCheckTimer = setTimeout(() => {
      debouncedResize();
    }, 200);

    // Listen for DOM changes and auto-resize window accordingly
    const observer = new MutationObserver(() => {
      debouncedResize();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });
    }

    // Listen for window resize events
    const resizeHandler = () => {
      debouncedResize();
    };
    window.addEventListener('resize', resizeHandler);

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeQuicknote();
      }
    };
    window.addEventListener('keydown', keyHandler);

    return () => {
      clearTimeout(timer);
      clearTimeout(initialCheckTimer);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      observer.disconnect();
      window.removeEventListener('resize', resizeHandler);
      window.removeEventListener('keydown', keyHandler);
      // Restore original history API
      window.history.pushState = originalNavigate;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  const handleSend = async () => {
    // Call toggle method to close window after sending note - Tauri only
    await closeQuicknote();
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full p-2 m-0 overflow-hidden bg-transparent"
      onPointerDown={(e) => {
        // Click outside the editor card closes the window.
        if (e.target === e.currentTarget) {
          closeQuicknote();
        }
      }}
    >
      <div
        id="quicknote-editor"
        className="w-full h-full rounded-xl border border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 overflow-hidden shadow-lg"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-2 px-2 py-1 border-b border-divider"
          data-tauri-drag-region
        >
          <div className="text-xs opacity-70 truncate">
            {t('quicknote.title') || 'Quick note'}
          </div>
          <button
            type="button"
            aria-label="Close"
            data-tauri-drag-region="false"
            className="ml-auto p-1 rounded-md hover:bg-default-100"
            onClick={(e) => {
              e.stopPropagation();
              closeQuicknote();
            }}
          >
            <Icon icon="tabler:x" width="16" height="16" />
          </button>
        </div>
        <BlinkoEditor
          mode="create"
          onSended={handleSend}
          withoutOutline={true}
        // height={undefined} - let editor auto-adjust height 
        />
      </div>
    </div>
  );
});

export default QuickNotePage;
