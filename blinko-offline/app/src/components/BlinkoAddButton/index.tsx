import { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { observer } from 'mobx-react-lite';
import { ShowEditBlinkoModel } from '../BlinkoRightClickMenu';
import { FocusEditorFixMobile } from "@/components/Common/Editor/editorUtils";
import { eventBus } from '@/lib/event';

export const BlinkoAddButton = observer(() => {
  const ICON_SIZE = {
    ACTION: 16,    // Icon size for action buttons
    CENTER: 26     // Icon size for center button
  };
  const BUTTON_SIZE = {
    ACTION: 35,    // Size for action buttons
    CENTER: 50     // Size for center button
  };
  const [isDragging, setIsDragging] = useState(false);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleWriteAction = () => {
    ShowEditBlinkoModel('2xl', 'create')
    FocusEditorFixMobile()
  };

  const handleAudioRecording = () => {
    ShowEditBlinkoModel('2xl', 'create');
    setTimeout(() => {
      eventBus.emit('editor:startAudioRecording');
    }, 300);
  };

  const handleMouseDown = () => {
    longPressTimer.current = setTimeout(() => {
      setIsLongPressing(true);
      handleAudioRecording();
      // Reset immediately after triggering recording
      setTimeout(() => setIsLongPressing(false), 100);
    }, 800);
  };

  const handleMouseUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (!isLongPressing) {
      handleWriteAction();
    }

    // Always reset immediately on release
    setIsLongPressing(false);
  };

  const handleMouseLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    // Always reset immediately when leaving
    setIsLongPressing(false);
  };

  return (<div style={{
    width: BUTTON_SIZE.CENTER,
    height: BUTTON_SIZE.CENTER,
    position: 'fixed',
    right: 40,
    bottom: 110,
    zIndex: 50
  }}>
    <motion.div
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      animate={{
        scale: isDragging ? 1.1 : isLongPressing ? 1.1 : 1,
        backgroundColor: isLongPressing ? "#FF6B6B" : "#FFCC00",
      }}
      whileTap={{
        scale: 0.85,
        boxShadow: '0 0 15px 4px rgba(255, 204, 0, 0.8)'
      }}
      whileHover={{
        scale: 1.05,
        boxShadow: '0 0 20px 4px rgba(255, 204, 0, 0.7)'
      }}
      transition={{
        duration: 0.3,
        scale: {
          type: "spring",
          stiffness: 400,
          damping: 15
        },
        backgroundColor: {
          duration: 0.2
        }
      }}
      className="absolute inset-0 flex items-center justify-center text-black rounded-full cursor-pointer"
      style={{
        boxShadow: isLongPressing
          ? '0 0 20px 6px rgba(255, 107, 107, 0.6)'
          : '0 0 10px 2px rgba(255, 204, 0, 0.5)'
      }}
    >
      <motion.div
        animate={{
          scale: isLongPressing ? 1.2 : 1
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 20
        }}
      >
        <Icon
          icon={isLongPressing ? "hugeicons:voice-id" : "material-symbols:add"}
          width={ICON_SIZE.CENTER}
          height={ICON_SIZE.CENTER}
        />
      </motion.div>
    </motion.div>
  </div>
  );
});