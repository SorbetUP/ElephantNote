import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { isInTauri } from "@/lib/tauriHelper";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { RootStore } from "@/store";
import { AiStore } from "@/store/aiStore";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AiInput } from "@/components/BlinkoAi/aiInput";
import { Icon } from "@/components/Common/Iconify/icons";

const QuickAIPage = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef<number>(0);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const aiStore = RootStore.Get(AiStore);
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        console.log(`Attempting to resize AI window: ${lastHeightRef.current} -> ${height}`);
        await invoke('resize_quickai_window', { height });
        lastHeightRef.current = height;
      } catch (error) {
        console.error('Failed to resize AI window:', error);
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

  // Debounced submit function to prevent multiple submissions
  const debouncedSubmit = () => {
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
    }
    submitTimeoutRef.current = setTimeout(() => {
      handleCustomSubmit();
    }, 300); // 300ms debounce
  };

  // Custom submit handler for quickai with additional navigation logic
  const handleCustomSubmit = async () => {
    if (!aiStore.input.trim() || isSubmitting) return;

    setIsSubmitting(true);
    
    const currentPrompt = aiStore.input.trim();
    
    try {
      if (isInTauri()) {
        // Use Tauri command to navigate main window to AI with prompt
        await invoke('navigate_main_to_ai_with_prompt', { prompt: currentPrompt });
        
        // Clear the input immediately
        aiStore.input = "";
        
        // Close the quick AI window
        await invoke('toggle_quickai_window');
      } else {
        // For web, start AI chat and navigate directly
        await aiStore.newChatWithSuggestion(currentPrompt);
        // Clear the input
        aiStore.input = "";
        navigate('/ai');
      }
    } catch (error) {
      console.error('Failed to start AI chat:', error);
    } finally {
      setIsSubmitting(false);
    }
  };


  // Handle cancel action
  const handleCancel = async () => {
    if (isInTauri()) {
      try {
        await invoke('toggle_quickai_window');
      } catch (error) {
        console.error('Failed to close quickai window:', error);
      }
    }
  };

  useEffect(() => {
    // Set page title
    if (isInTauri()) {
      document.title = 'Quick AI';
    }

    // Set body overflow to hidden for full-height layout
    document.body.style.overflow = 'hidden';

    // Auto focus will be handled by AiInput component

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

    return () => {
      clearTimeout(initialCheckTimer);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
      observer.disconnect();
      window.removeEventListener('resize', resizeHandler);
    };
  }, []);

  // Monitor aiStore.input changes for auto-resize
  useEffect(() => {
    debouncedResize();
  }, [aiStore.input]);

  return (
    <div className="w-full h-full p-0 m-0 overflow-hidden">
      <div
        ref={containerRef}
        data-tauri-drag-region
        className="w-full h-full"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="w-full relative"
        >
          {/* Add cancel button as overlay */}
          <div className="absolute top-3 right-3 z-10">
            <div 
              className="bg-gray-500/20 hover:bg-gray-500/30 rounded-full p-2 cursor-pointer transition-colors"
              onClick={handleCancel}
            >
              <Icon icon="material-symbols:close" width="20" height="20" className="text-foreground/70" />
            </div>
          </div>
          
          {/* Use AiInput component with custom styling */}
          <AiInput 
            className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
            onSubmit={() => debouncedSubmit()}
            withoutOutline={true}
          />
        </motion.div>
      </div>
    </div>
  );
});

export default QuickAIPage;