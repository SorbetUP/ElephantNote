import { observer } from "mobx-react-lite";
import { useEffect, useState, useRef } from "react";
import { Icon } from "@/components/Common/Iconify/icons";
import { isInTauri } from "@/lib/tauriHelper";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion } from "framer-motion";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { TextSelectionToolbarConfig, DEFAULT_TEXT_SELECTION_TOOLBAR_CONFIG } from "@/../../shared/lib/types";


interface TextSelectionEvent {
  text: string;
  x: number;
  y: number;
  modifierPressed: boolean;
  modifier: string;
}

const QuickToolPage = observer(() => {
  console.log("🚀 QuickToolPage component instantiated");

  const blinko = RootStore.Get(BlinkoStore);
  const [selectedText, setSelectedText] = useState<string>("");
  const [toolbarConfig, setToolbarConfig] = useState<TextSelectionToolbarConfig | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Handle translate action
  const handleTranslate = async () => {
    console.log("🌐 Translate clicked for text:", selectedText);
    if (!selectedText || !toolbarConfig) return;

    try {
      const fromLang = toolbarConfig.translationFromLang || 'auto';
      const toLang = toolbarConfig.translationToLang || 'zh';
      const prompt = `translate "${selectedText}" from ${fromLang} to ${toLang}`;

      console.log("📤 Sending translation prompt:", prompt);
      await invoke('navigate_main_to_ai_with_prompt', { prompt });
      hideToolbar();
    } catch (error) {
      console.error("❌ Failed to translate:", error);
    }
  };

  // Handle copy action
  const handleCopy = async () => {
    console.log("📋 Copy clicked for text:", selectedText);
    if (!selectedText) return;

    try {
      if (isInTauri()) {
        await invoke('copy_to_clipboard', { text: selectedText });
      } else {
        await navigator.clipboard.writeText(selectedText);
      }
      console.log("✅ Text copied successfully");
      hideToolbar();
    } catch (error) {
      console.error("❌ Failed to copy text:", error);
    }
  };

  // Handle explain action
  const handleExplain = async () => {
    console.log("🤔 Explain clicked for text:", selectedText);
    if (!selectedText) return;

    try {
      const prompt = `explain "${selectedText}"`;
      console.log("📤 Sending explanation prompt:", prompt);
      await invoke('navigate_main_to_ai_with_prompt', { prompt });
      hideToolbar();
    } catch (error) {
      console.error("❌ Failed to explain:", error);
    }
  };

  // Handle bookmark action
  const handleBookmark = async () => {
    console.log("⭐ Bookmark clicked for text:", selectedText);
    if (!selectedText) return;

    try {
      await blinko.upsertNote.call({
        content: selectedText,
        type: 0 // BLINKO type
      });
      console.log("✅ Text bookmarked successfully");
      hideToolbar();
    } catch (error) {
      console.error("❌ Failed to bookmark:", error);
    }
  };

  // Hide toolbar and close window
  const hideToolbar = async () => {
    if (isInTauri()) {
      try {
        await invoke('hide_quicktool_window');
      } catch (error) {
        console.error("Failed to hide quicktool window:", error);
      }
    }
  };


  // Get toolbar configuration
  const getToolbarConfig = async () => {
    try {
      const config = await blinko.config.value?.desktopHotkeys;
      const toolbarConfig = config?.textSelectionToolbar || DEFAULT_TEXT_SELECTION_TOOLBAR_CONFIG;
      setToolbarConfig(toolbarConfig);
    } catch (error) {
      console.error('Failed to get toolbar config:', error);
      setToolbarConfig(DEFAULT_TEXT_SELECTION_TOOLBAR_CONFIG);
    }
  };

  // Setup component
  useEffect(() => {
    console.log("🔧 QuickToolPage useEffect running, isInTauri:", isInTauri());

    if (!isInTauri()) {
      console.log("⚠️ Not in Tauri environment");
      return;
    }

    // Set page title
    document.title = "Quick Tool";

    // Set body overflow to hidden for compact layout
    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.body.style.padding = '0';

    // Get toolbar configuration initially
    getToolbarConfig();

    // Listen for text selection events - with debugging
    let unlistenFn: (() => void) | null = null;
    console.log("🔧 Setting up text-selection-detected event listener...");

    // Try both global and window-specific listening
    const setupListeners = async () => {
      try {
        // Global listener
        const globalUnlisten = await listen<TextSelectionEvent>('text-selection-detected', async (event) => {
          console.log("📡 GLOBAL EVENT RECEIVED - text-selection-detected:", event.payload);
          console.log("📝 Text content:", event.payload.text);

          // Refresh configuration when receiving text selection event
          await getToolbarConfig();

          setSelectedText(event.payload.text || "");
        });
        console.log("✅ Global event listener registered");

        // Window-specific listener (if available)
        try {
          const windowUnlisten = await listen<TextSelectionEvent>('text-selection-detected', async (event) => {
            console.log("📡 WINDOW EVENT RECEIVED - text-selection-detected:", event.payload);

            // Refresh configuration when receiving text selection event
            await getToolbarConfig();

            // Reset selected text first, then set new text
            setSelectedText("");
            setTimeout(() => setSelectedText(event.payload.text || ""), 0);
          });
          console.log("✅ Window-specific event listener registered");

          // Combine cleanup functions
          unlistenFn = () => {
            globalUnlisten();
            windowUnlisten();
          };
        } catch (windowError) {
          console.warn("⚠️ Window-specific listener failed, using global only:", windowError);
          unlistenFn = globalUnlisten;
        }

      } catch (error) {
        console.error("❌ Failed to setup event listeners:", error);
        unlistenFn = null;
      }
    };

    // Delay event listener setup to ensure component is fully mounted
    const timer = setTimeout(() => {
      console.log("🔧 Setting up event listeners after component mount...");
      setupListeners();
    }, 100);

    return () => {
      // Cleanup
      clearTimeout(timer);
      document.body.style.overflow = '';
      document.body.style.margin = '';
      document.body.style.padding = '';

      // Cleanup event listener
      if (unlistenFn) {
        try {
          unlistenFn();
          console.log("✅ Event listener cleaned up");
        } catch (error) {
          console.warn("Error cleaning up event listener:", error);
        }
      }
    };
  }, []);


  // For now, just show the toolbar when the window is opened
  // The selected text will be handled differently or we can show a placeholder
  console.log("🔍 QuickToolPage render check - isInTauri:", isInTauri());
  console.log("🌐 Current URL:", window.location.href);
  console.log("📱 User agent:", navigator.userAgent);


  console.log("✅ QuickToolPage rendering");

  // Check and fix route when component mounts or window gains focus
  useEffect(() => {
    const checkAndFixRoute = () => {
      if (window.location.pathname !== '/quicktool') {
        console.log("🔄 Route is wrong, fixing to /quicktool");
        window.history.replaceState(null, '', '/quicktool');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    };

    // Check immediately
    checkAndFixRoute();

    // Also check when window gains focus
    const handleFocus = () => {
      console.log("🔄 Window focused, checking route");
      checkAndFixRoute();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return (
    <div className="w-full h-full p-0 m-0 flex items-center justify-center">
      <div className="flex items-center gap-1">
        {/* Translate Button */}
        <div
        onClick={handleTranslate}
        className="min-w-8 h-8 bg-none flex items-center justify-center hover:opacity-80 transition-all cursor-pointer"
      >
        <Icon icon="material-symbols:translate" className="text-sm" />
      </div>

      {/* Copy Button */}
      <div
        onClick={handleCopy}
        className="min-w-8 h-8 bg-none flex items-center justify-center hover:opacity-80 translation-all cursor-pointer"
      >
        <Icon icon="tabler:copy" className="text-sm" />
      </div>

      {/* Explain Button */}
      <div
        onClick={handleExplain}
        className="min-w-8 h-8 bg-none flex items-center justify-center hover:opacity-80 transition-all cursor-pointer"
      >
        <Icon icon="tabler:message-circle-question" className="text-sm" />
      </div>

      {/* Bookmark Button */}
      <div
        onClick={handleBookmark}
        className="min-w-8 h-8 bg-none flex items-center justify-center hover:opacity-80 transition-all cursor-pointer"
      >
        <Icon icon="tabler:bookmark-edit" className="text-sm" />
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-border" />

      {/* Close Button */}
      <div
        onClick={hideToolbar}
        className="min-w-8 h-8 bg-none flex items-center justify-center hover:opacity-80 transition-all cursor-pointer"
      >
        <Icon icon="material-symbols:close" className="text-sm" />
        </div>
      </div>
    </div>
  );
});

export default QuickToolPage;
