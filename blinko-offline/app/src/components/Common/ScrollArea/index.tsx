import i18n from "@/lib/i18n";
import { observer } from "mobx-react-lite";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useMediaQuery } from "usehooks-ts";

type IProps = {
  style?: any;
  className?: any;
  // Can return a Promise to allow the ScrollArea to "auto-fill" while near bottom.
  onBottom?: () => void | Promise<void>;
  onRefresh?: () => Promise<any>;
  children: any;
  pullDownThreshold?: number;
  maxPullDownDistance?: number;
  fixMobileTopBar?: boolean
  // How far from the bottom (in px) we start prefetching. If omitted, uses a dynamic value.
  bottomOffset?: number;
};

export type ScrollAreaHandles = {
  scrollToBottom: () => void;
  scrollTo: (position: number) => void;
}

export const ScrollArea = observer(forwardRef<ScrollAreaHandles, IProps>(({
  style,
  className,
  children,
  onBottom,
  onRefresh,
  pullDownThreshold = 60,
  maxPullDownDistance = 100,
  fixMobileTopBar = false,
  bottomOffset
}, ref) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPc = useMediaQuery('(min-width: 768px)');

  // Pull to refresh states
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Touch tracking
  const startYRef = useRef(0);
  const canPullRef = useRef(true); // Initialize as true for initial state
  const currentInstanceRef = useRef(Math.random().toString(36)); // Unique identifier for this ScrollArea instance

  const bottomInFlightRef = useRef(false);
  const bottomRafIdRef = useRef<number | null>(null);

  const getTargetNode = (target: EventTarget | null): Node | null => {
    return target instanceof Node ? target : null;
  };

  const getTargetElement = (target: EventTarget | null): Element | null => {
    if (target instanceof Element) return target;
    if (target instanceof Node) return target.parentElement;
    return null;
  };

  const getClientY = (e: TouchEvent | MouseEvent) => {
    if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent) {
      return e.touches[0]?.clientY ?? 0;
    }
    return e.clientY;
  };

  const getEffectiveBottomOffset = (el: HTMLDivElement) => {
    // Start prefetching earlier on tall viewports to avoid "hitting the wall" when scrolling fast.
    return typeof bottomOffset === 'number' ? bottomOffset : Math.max(300, Math.floor(el.clientHeight * 1.5));
  };

  const isNearBottom = (el: HTMLDivElement) => {
    const offset = getEffectiveBottomOffset(el);
    return (el.scrollHeight - el.scrollTop) <= (el.clientHeight + offset);
  };

  const scheduleBottomCheck = () => {
    if (!onBottom) return;
    if (bottomRafIdRef.current != null) return;
    bottomRafIdRef.current = requestAnimationFrame(() => {
      bottomRafIdRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      if (!isNearBottom(el)) return;
      void maybeCallOnBottom();
    });
  };

  const maybeCallOnBottom = async () => {
    if (!onBottom) return;
    if (bottomInFlightRef.current) return;

    const el = scrollRef.current;
    const beforeHeight = el?.scrollHeight ?? null;

    bottomInFlightRef.current = true;
    try {
      await onBottom();
    } finally {
      bottomInFlightRef.current = false;
    }

    // If content grew and we're still near the bottom, keep loading to stay ahead of fast scrolling.
    requestAnimationFrame(() => {
      const cur = scrollRef.current;
      if (!cur) return;
      if (beforeHeight != null && cur.scrollHeight <= beforeHeight) return;
      if (isNearBottom(cur)) scheduleBottomCheck();
    });
  };

  useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      scrollRef.current!.scrollTop = scrollRef.current!.scrollHeight;
    },
    scrollTo: (position: number) => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = position;
      }
    },
  }));

  const handleScroll = (e) => {
    const target = e.target;
    // Defensive clamp: some trackpad horizontal gestures can move hidden-x scroll containers,
    // which visually clips content from the left.
    if (target.scrollLeft !== 0) {
      target.scrollLeft = 0;
    }

    if (onBottom && isNearBottom(target)) {
      scheduleBottomCheck();
    }

    // Update can pull state
    canPullRef.current = target.scrollTop === 0;
  };

  const handleTouchStart = (e: TouchEvent | MouseEvent) => {
    if (!onRefresh || isRefreshing) return;

    // Ensure the event is targeting this specific ScrollArea
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    // Check if the touch started within this ScrollArea
    const targetNode = getTargetNode(e.target);
    if (!targetNode || !scrollElement.contains(targetNode)) return;

    // Check if the touch event is within an expanded container (blog mode)
    const expandedContainer = getTargetElement(e.target)?.closest('.expanded-container');
    if (expandedContainer) {
      return;
    }

    // Check if at top position - allow small tolerance for bounce effect
    if (scrollElement.scrollTop > 5) return;

    const clientY = getClientY(e);
    startYRef.current = clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: TouchEvent | MouseEvent) => {
    if (!isDragging || !onRefresh || isRefreshing) return;

    // Check if the touch event is within an expanded container (blog mode)
    const expandedContainer = getTargetElement(e.target)?.closest('.expanded-container');
    if (expandedContainer) {
      setIsDragging(false);
      setPullDistance(0);
      return;
    }

    // Ensure we're still within this ScrollArea
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const clientY = getClientY(e);
    const deltaY = clientY - startYRef.current;

    if (deltaY > 0) {
      // Only prevent default if we're at the top and pulling down WITH SUFFICIENT FORCE
      if (scrollElement.scrollTop === 0) {
        // Only prevent default and trigger refresh UI when pull distance is significant
        // This allows small bounces to work naturally while still enabling pull-to-refresh
        if (deltaY > 80) { // Require at least 30px pull before interfering
          e.preventDefault();
          const distance = Math.min(deltaY * 0.5, maxPullDownDistance);
          setPullDistance(distance);
        }
        // For smaller pulls, let native bounce effect work
      }
    }
  };

  const handleTouchEnd = async (e: TouchEvent | MouseEvent) => {
    if (!isDragging || !onRefresh) return;

    // Check if the touch event is within an expanded container (blog mode)
    const expandedContainer = getTargetElement(e.target)?.closest('.expanded-container');
    if (expandedContainer) {
      setIsDragging(false);
      setPullDistance(0);
      return;
    }

    setIsDragging(false);

    if (pullDistance >= pullDownThreshold) {
      setIsRefreshing(true);

      try {
        await onRefresh();
      } catch (error) {
        console.error('Refresh failed:', error);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  useEffect(() => {
    const divElement = scrollRef.current;
    if (!divElement) return;

    // Initialize canPull state
    canPullRef.current = divElement.scrollTop === 0;

    divElement.addEventListener("scroll", handleScroll);
    const keepHorizontalAnchor = () => {
      if (divElement.scrollLeft !== 0) {
        divElement.scrollLeft = 0;
      }
    };
    divElement.addEventListener("wheel", keepHorizontalAnchor, { passive: true });
    // Best-effort: some trackpad gestures can leave the container with a non-zero scrollLeft
    // without an immediate follow-up scroll event. Clamp on mount as well.
    keepHorizontalAnchor();
    requestAnimationFrame(keepHorizontalAnchor);
    const clampT1 = window.setTimeout(keepHorizontalAnchor, 50);
    const clampT2 = window.setTimeout(keepHorizontalAnchor, 200);

    // Add pull-to-refresh listeners only if onRefresh exists AND device is mobile
    if (onRefresh && !isPc) {
      divElement.addEventListener('touchstart', handleTouchStart, { passive: false });
      divElement.addEventListener('touchmove', handleTouchMove, { passive: false });
      divElement.addEventListener('touchend', handleTouchEnd, { passive: true });
    }

    return () => {
      divElement.removeEventListener("scroll", handleScroll);
      divElement.removeEventListener("wheel", keepHorizontalAnchor);
      window.clearTimeout(clampT1);
      window.clearTimeout(clampT2);
      if (bottomRafIdRef.current != null) {
        cancelAnimationFrame(bottomRafIdRef.current);
        bottomRafIdRef.current = null;
      }
      if (onRefresh && !isPc) {
        divElement.removeEventListener('touchstart', handleTouchStart);
        divElement.removeEventListener('touchmove', handleTouchMove);
        divElement.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [onRefresh, isRefreshing, isDragging, pullDistance, pullDownThreshold, isPc, onBottom, bottomOffset]);

  // Calculate pull progress and arrow rotation
  const pullProgress = Math.min(pullDistance / pullDownThreshold, 1);
  const arrowRotation = pullProgress * 180; // 0 to 180 degrees
  const isReadyToRefresh = pullDistance >= pullDownThreshold;

  const showRefreshIndicator = onRefresh && !isPc && (pullDistance > 0 || isRefreshing);
  const refreshText = isRefreshing
    ? i18n.t('common.refreshing')
    : isReadyToRefresh
      ? i18n.t('common.releaseToRefresh')
      : i18n.t('common.pullToRefresh');

  // Arrow Icon Component
  const ArrowIcon = () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className={`transition-transform duration-150 ${isDragging ? '' : 'duration-300'}`}
      style={{
        transform: `rotate(${arrowRotation}deg)`,
        opacity: pullProgress
      }}
    >
      <path
        d="M12 5l0 14m-7-7l7-7 7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <div
      ref={scrollRef}
      data-scroll-area-id={currentInstanceRef.current}
      style={{
        ...style,
        paddingTop: showRefreshIndicator ? `${pullDistance}px` : undefined,
        transition: isDragging ? 'none' : 'padding-top 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
      className={`w-full ${className} overflow-y-scroll overflow-x-hidden ${isPc ? '' : 'scrollbar-hide'} scroll-smooth scroll-area`}
    >
      {fixMobileTopBar && !isPc && <div className="h-16"></div>}
      {/* Pull to refresh indicator */}
      {showRefreshIndicator && (
        <div
          className={`flex items-center justify-center transition-all duration-150 ${isDragging ? '' : 'duration-300'
            } ${isReadyToRefresh ? 'text-primary' : 'text-gray-500'} `}
          style={{
            height: `${pullDistance}px`,
            marginTop: `-${pullDistance}px`,
            opacity: Math.max(pullProgress * 0.8, 0.3),
            backdropFilter: 'blur(8px)'
          }}
        >
          <div className="flex items-center gap-2">
            {isRefreshing ? (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <ArrowIcon />
            )}
            <span
              className={`text-sm font-medium transition-all duration-200 ${isReadyToRefresh ? 'scale-105' : 'scale-100'
                }`}
              style={{ opacity: Math.max(pullProgress, 0.6) }}
            >
              {refreshText}
            </span>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}))
