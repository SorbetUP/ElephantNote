import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isInTauri, isDesktop } from '@/lib/tauriHelper';
import { getTauriListen } from '@/lib/tauriEvent';
import { RootStore } from '@/store';
import { AiStore } from '@/store/aiStore';

export const useQuickaiHotkey = (enabled = true) => {
  const navigate = useNavigate();
  const aiStore = RootStore.Get(AiStore);

  useEffect(() => {
    if (!enabled || !isInTauri() || !isDesktop()) return;

    let isMounted = true;
    const unlisteners: (() => void)[] = [];
    let isProcessing = false; // Prevent duplicate processing

    const setupEventListeners = async () => {
      try {
        const listen = await getTauriListen();

        if (!isMounted) return;

        // Listen for quick AI events (legacy support)
        const unlistenQuickai = await listen('quickai-triggered', () => {
          try {
            // Navigate to AI page to continue the conversation
            navigate('/ai');
            console.log('Quick AI triggered - navigating to AI page');
          } catch (error) {
            console.error('Error handling quickai event:', error);
          }
        });

        if (isMounted && unlistenQuickai) {
          unlisteners.push(unlistenQuickai);
        }

        if (!isMounted) return;

        // Listen for navigation events from quickai window with prompt
        const unlistenNavigation = await listen<string>('navigate-to-ai-with-prompt', async (event) => {
          const prompt = event.payload;
          console.log('Received navigation event with prompt:', prompt);

          // Prevent duplicate processing
          if (isProcessing) {
            console.log('Already processing, ignoring duplicate event');
            return;
          }

          isProcessing = true;

          try {
            // Start AI chat with the prompt
            await aiStore.newChat();
            await aiStore.newChatWithSuggestion(prompt);

            // Navigate to AI page
            navigate('/ai');
          } catch (error) {
            console.error('Failed to process AI navigation:', error);
          } finally {
            // Reset processing flag after a short delay
            setTimeout(() => {
              isProcessing = false;
            }, 1000);
          }
        });

        if (isMounted && unlistenNavigation) {
          unlisteners.push(unlistenNavigation);
        }

      } catch (error) {
        console.error('Failed to setup Tauri event listeners:', error);
      }
    };

    setupEventListeners();

    // Cleanup function
    return () => {
      isMounted = false;

      // Clean up all listeners
      unlisteners.forEach(unlisten => {
        try {
          if (unlisten && typeof unlisten === 'function') {
            unlisten();
          }
        } catch (error) {
          console.error('Error cleaning up event listener:', error);
        }
      });
    };
  }, [enabled, navigate, aiStore]);
};
