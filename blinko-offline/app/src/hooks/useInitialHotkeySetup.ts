import { useEffect } from 'react';
import { isInTauri, isDesktop } from '@/lib/tauriHelper';
import { invoke } from '@tauri-apps/api/core';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { UserStore } from '@/store/user';

const DEFAULT_HOTKEY_CONFIG = {
  quickNote: 'Shift+Space',
  quickAI: 'Alt+Space',
  enabled: true,
  aiEnabled: true,
  systemTrayEnabled: true,
  windowBehavior: 'show' as const,
  textSelectionToolbar: {
    enabled: true,
    triggerModifier: 'none' as const,
    features: {
      translation: true,
      copy: true,
      qna: true,
      bookmark: true
    }
  }
};

export const useInitialHotkeySetup = () => {
  useEffect(() => {
    if (!isInTauri() || !isDesktop()) return;

    const setupInitialHotkeys = async () => {
      try {
        const blinko = RootStore.Get(BlinkoStore);
        const userStore = RootStore.Get(UserStore);
        if (userStore.isLogin) {
          await blinko.config.call();
        }

        const config = blinko.config.value?.desktopHotkeys;
        const finalConfig = {
          ...DEFAULT_HOTKEY_CONFIG,
          ...config,
          systemTrayEnabled: true,
          windowBehavior: 'show' as const
        };
        
        console.log('Setting up initial hotkeys with config:', finalConfig);
        
        // Register quicknote shortcut if enabled
        if (finalConfig.enabled) {
          try {
            await invoke('register_hotkey', {
              shortcut: finalConfig.quickNote,
              command: 'quicknote'
            });
            console.log('Initial registration - quicknote shortcut:', finalConfig.quickNote);
          } catch (error) {
            console.warn('Failed to register initial quicknote shortcut:', error);
          }
        }
        
        // Register quickai shortcut if enabled
        if (finalConfig.aiEnabled) {
          try {
            await invoke('register_hotkey', {
              shortcut: finalConfig.quickAI,
              command: 'quickai'
            });
            console.log('Initial registration - quickai shortcut:', finalConfig.quickAI);
          } catch (error) {
            console.warn('Failed to register initial quickai shortcut:', error);
          }
        }
        
        // Setup text selection monitoring if enabled
        if (finalConfig.textSelectionToolbar.enabled) {
          try {
            await invoke('setup_text_selection_monitoring', {
              enabled: true,
              triggerModifier: finalConfig.textSelectionToolbar.triggerModifier
            });
            console.log('Text selection monitoring enabled with trigger:', finalConfig.textSelectionToolbar.triggerModifier);
          } catch (error) {
            console.warn('Failed to setup text selection monitoring:', error);
          }
        }
      } catch (error) {
        console.error('Failed to setup initial hotkeys:', error);
      }
    };

    // Setup hotkeys after a short delay to ensure app is fully initialized
    const timer = setTimeout(() => {
      setupInitialHotkeys();
    }, 1000);

    return () => {
      clearTimeout(timer);
    };
  }, []);
};
