import { useEffect, useState, useRef } from "react";
import { helper } from "./helper";
import { BlinkoStore } from "@/store/blinkoStore";
import { RootStore } from "@/store";
import { isAndroid, isInTauri, isIOS } from '@/lib/tauriHelper';
import { ShowEditBlinkoModel } from '@/components/BlinkoRightClickMenu';
import { eventBus } from '@/lib/event';

import { readFile } from "@tauri-apps/plugin-fs";
import { FocusEditorFixMobile } from "@/components/Common/Editor/editorUtils";
import { ToastPlugin } from "@/store/module/Toast/Toast";

export const useConfigSetting = (configKey: keyof BlinkoStore['config']['value']) => {
  const blinko = RootStore.Get(BlinkoStore);

  const store = RootStore.Local(() => ({
    value: '',
    isVisible: false,
    setValue(newValue: string) {
      this.value = newValue;
    },
    toggleVisibility() {
      this.isVisible = !this.isVisible;
    }
  }));

  useEffect(() => {
    if (blinko.config.value && blinko.config.value[configKey]) {
      store.setValue(blinko.config.value[configKey] as string);
    }
  }, [blinko.config.value, configKey]);

  return {
    value: store.value,
    isVisible: store.isVisible,
    setValue: store.setValue,
    toggleVisibility: store.toggleVisibility
  };
};


export const useSwiper = (threshold = 50) => {
  const [isVisible, setIsVisible] = useState(true);
  const touchStartY = useRef(0);
  const lastDirection = useRef<'up' | 'down'>();

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0]?.clientY || 0;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touchY = e.touches[0]?.clientY || 0;
      const deltaY = touchY - touchStartY.current;

      if (Math.abs(deltaY) > threshold) {
        if (deltaY > 0) {
          lastDirection.current = 'down';
          setIsVisible(true);
        } else {
          lastDirection.current = 'up';
          setIsVisible(false);
        }
        touchStartY.current = touchY;
      }
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [threshold]);

  return isVisible;
};


export const handlePaste = (event) => {
  //@ts-ignore
  const clipboardData = event.clipboardData || window.clipboardData;
  const items = clipboardData.items;
  let files = [];

  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === "file") {
      const file = items[i].getAsFile();
      //@ts-ignore
      files.push(file);
    }
  }

  if (files.length > 0) {
    return files
  }
};


export const usePasteFile = (targetRef) => {
  const [pastedFiles, setPastedFiles] = useState([]);

  useEffect(() => {


    const targetElement = targetRef.current;

    if (targetElement) {
      targetElement.addEventListener("paste", handlePaste);
    }

    return () => {
      if (targetElement) {
        targetElement.removeEventListener("paste", handlePaste);
      }
    };
  }, [targetRef]);

  return pastedFiles;
};


interface HistoryBackProps<T extends string> {
  state: boolean;
  onStateChange: () => void;
  historyState: T;
}

export const useHistoryBack = <T extends string>({
  state,
  onStateChange,
  historyState
}: HistoryBackProps<T>) => {
  useEffect(() => {
    if (state) {
      try {
        const currentPath = window.location.pathname + window.location.search;
        history.pushState({
          [historyState]: true,
          timestamp: Date.now(),
          path: currentPath
        }, '', currentPath);
      } catch (error) {
        console.warn('History pushState failed:', error);
      }
    }

    const handlePopState = (event: PopStateEvent) => {
      if (state && event?.state) {
        onStateChange();
      }
    };

    try {
      window.addEventListener('popstate', handlePopState);
    } catch (error) {
      console.warn('Failed to add popstate listener:', error);
    }

    return () => {
      try {
        window.removeEventListener('popstate', handlePopState);
      } catch (error) {
        console.warn('Failed to remove popstate listener:', error);
      }
    };
  }, [state, onStateChange, historyState]);
};

export const useIsIOS = () => {
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    setIsIOS(helper.env.isIOS());
  }, []);
  return isIOS;
};

// Global state for Android shortcuts handling
let androidShortcutsIntervalId: NodeJS.Timeout | null = null;
let isProcessingSharedData = false;
let isInitialized = false;

// Singleton function to initialize Android shortcuts listener
const initializeAndroidShortcuts = () => {
  if (isInitialized || !isAndroid() || !isInTauri()) {
    return;
  }

  isInitialized = true;

  const checkAndroidData = () => {
      // Handle shortcuts
      const action = window.localStorage.getItem('android_shortcut_action');
      if (action) {
        window.localStorage.removeItem('android_shortcut_action');
        switch (action) {
          case 'quick_note':
            ShowEditBlinkoModel('2xl', 'create');
            FocusEditorFixMobile()
            break;

          case 'voice_recording':
            ShowEditBlinkoModel('2xl', 'create');
            // Use eventBus to trigger audio recording after editor is ready
            setTimeout(() => {
              eventBus.emit('editor:startAudioRecording');
            }, 300);
            break;
        }
      }

      // Handle shared data
      const shareDataStr = window.localStorage.getItem('android_share_data');
      if (shareDataStr && !isProcessingSharedData) {
        isProcessingSharedData = true;
        // alert(shareDataStr)
        window.localStorage.removeItem('android_share_data');
        try {
          const shareData = JSON.parse(shareDataStr);
          if (shareData.text) {
            // Remove surrounding quotes (single, double, backticks) and trim whitespace
            let cleanText = shareData.text.trim();
            if ((cleanText.startsWith('"') && cleanText.endsWith('"')) ||
                (cleanText.startsWith("'") && cleanText.endsWith("'")) ||
                (cleanText.startsWith('`') && cleanText.endsWith('`'))) {
              cleanText = cleanText.slice(1, -1);
            }
            ShowEditBlinkoModel('2xl', 'create', { text: cleanText });
            isProcessingSharedData = false;
          }
          else if (shareData.stream && shareData.content_type) {
              readFile(shareData.stream).then(contents => {
                const file = new File([contents], shareData.name || 'shared_file', {
                  type: shareData.content_type
                });
                ShowEditBlinkoModel('2xl', 'create', { file });
                isProcessingSharedData = false;
              }).catch((error: Error) => {
                console.warn('fetching shared content failed:', error);
              RootStore.Get(ToastPlugin).error(error?.message)
              isProcessingSharedData = false;
            });
          }
          else {
            ShowEditBlinkoModel('2xl', 'create');
            isProcessingSharedData = false;
          }
        } catch (e) {
          console.error('Failed to parse share data:', e);
          // Fallback: just open create modal
          RootStore.Get(ToastPlugin).error(e?.message)
          setTimeout(() => { isProcessingSharedData = false; }, 100);
        }
      }
    };

  // Start checking immediately
  checkAndroidData();

  // Register global interval (slower polling since Android injects with 1.5s delay)
  androidShortcutsIntervalId = setInterval(checkAndroidData, 800);
};

// Cleanup function
const cleanupAndroidShortcuts = () => {
  if (androidShortcutsIntervalId) {
    clearInterval(androidShortcutsIntervalId);
    androidShortcutsIntervalId = null;
  }
  isProcessingSharedData = false;
  isInitialized = false;
};

export const useAndroidShortcuts = () => {
  useEffect(() => {
    // Initialize only once globally
    initializeAndroidShortcuts();

    // Return cleanup function (cleanup when app unmounts)
    return () => {
      cleanupAndroidShortcuts();
    };
  }, []);
};

// iOS Share Inbox (Share Extension -> App Group -> App)
let isIosShareInitialized = false;
let isProcessingIosShare = false;

async function checkIosPendingShare() {
  if (isProcessingIosShare) return;
  isProcessingIosShare = true;
  try {
    const { getPendingSharePayload, clearPendingSharePayload } = await import('tauri-plugin-blinko-api');
    const payloadStr = await getPendingSharePayload();
    if (!payloadStr) {
      isProcessingIosShare = false;
      return;
    }

    await clearPendingSharePayload();

    let payload: any = null;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      payload = { text: payloadStr };
    }

    if (payload?.text) {
      const cleanText = String(payload.text).trim();
      ShowEditBlinkoModel('2xl', 'create', { text: cleanText });
      FocusEditorFixMobile();
      isProcessingIosShare = false;
      return;
    }

    if (payload?.localPath && payload?.content_type) {
      try {
        const contents = await readFile(payload.localPath);
        const file = new File([contents], payload.name || 'shared_file', {
          type: payload.content_type
        });
        ShowEditBlinkoModel('2xl', 'create', { file });
        FocusEditorFixMobile();
      } catch (error: any) {
        console.warn('iOS share file read failed:', error);
        RootStore.Get(ToastPlugin).error(error?.message || String(error));
        ShowEditBlinkoModel('2xl', 'create');
      } finally {
        isProcessingIosShare = false;
      }
      return;
    }

    ShowEditBlinkoModel('2xl', 'create');
  } catch (error: any) {
    console.warn('iOS share inbox check failed:', error);
  } finally {
    isProcessingIosShare = false;
  }
}

export const useIOSShareInbox = () => {
  useEffect(() => {
    if (isIosShareInitialized || !isInTauri() || !isIOS()) return;
    isIosShareInitialized = true;

    const onFocus = () => {
      checkIosPendingShare();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkIosPendingShare();
      }
    };

    checkIosPendingShare();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      isIosShareInitialized = false;
      isProcessingIosShare = false;
    };
  }, []);
};

