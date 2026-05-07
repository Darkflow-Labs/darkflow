"use client";

import {
  DndContext,
  PointerSensor,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import { Bot, LineChart, Radar, SquareTerminal, Wallet } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { CoinInsightsPanel } from "@/components/coin/CoinInsightsPanel";
import { ExpandedTabs, type TabItem } from "@/components/nav/ExpandedTabs";
import { useTerminal } from "@/components/layout/TerminalState";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { Button } from "@darkflow/ui/button";

const navTabs: TabItem[] = [
  { title: "Terminal", icon: SquareTerminal, url: "/" },
  { type: "separator" },
  { title: "Explore", icon: LineChart, url: "/explore" },
  { type: "separator" },
  { title: "Recon", icon: Radar, url: "/recon" },
  { type: "separator" },
  { title: "Portfolio", icon: Wallet, url: "/portfolio" },
];

/** Tween: spring on left/width looked smooth then snapped (width "auto" → 420 is not interpolable). */
const dockTransition = {
  type: "tween" as const,
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

type DeskShellProps = {
  children: ReactNode;
};

export const DeskShell = ({ children }: DeskShellProps) => {
  const pathname = usePathname();
  const isHub = pathname === "/";
  const isLg = useMediaQuery("(min-width: 1024px)");
  const {
    selectedSymbol,
    openCoinInsights,
    isTokenPinned,
    pinnedTokens,
    coinInsightsOpen,
    coinInsightsWide,
    chatOpen,
    setChatOpen,
  } = useTerminal();
  const [topInset, setTopInset] = useState(48);
  const [chatRect, setChatRect] = useState<{ left: number; width: number } | null>(null);
  const [toggleLeft, setToggleLeft] = useState<number | null>(null);
  const [coinToggleLeft, setCoinToggleLeft] = useState<number | null>(null);
  const [coinPanelLeft, setCoinPanelLeft] = useState<number | null>(null);
  const toggleDragStartLeftRef = useRef(0);
  const pointerToggleDragRef = useRef<{ startX: number; startLeft: number; moved: boolean } | null>(null);
  const coinPointerDragRef = useRef<{ startX: number; startLeft: number; moved: boolean } | null>(null);
  const userMovedToggleRef = useRef(false);
  const pageSnapSideRef = useRef<Record<string, "left" | "right">>({});
  const hasDraggedToggleRef = useRef(false);
  const resizeStateRef = useRef<{ side: "left" | "right"; startX: number; startLeft: number; startWidth: number } | null>(null);
  const { attributes: toggleDragAttributes, listeners: toggleDragListeners, setNodeRef: setToggleDragNodeRef } =
    useDraggable({ id: "ai-chat-toggle" });
  const dragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  );

  useLayoutEffect(() => {
    const measure = () => {
      const el = document.getElementById("console-app-header");
      if (el) {
        setTopInset(el.getBoundingClientRect().bottom);
        return;
      }
      setTopInset(48);
    };

    measure();
    const el = document.getElementById("console-app-header");
    const ro = new ResizeObserver(measure);
    if (el) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [pathname]);

  const [viewport, setViewport] = useState(() =>
    typeof window === "undefined"
      ? { w: 1280, rem: 16 }
      : {
          w: window.innerWidth,
          rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
        },
  );

  useLayoutEffect(() => {
    const read = () => {
      setViewport({
        w: window.innerWidth,
        rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
      });
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  const gutterLeftPx = isLg ? 15 * viewport.rem : 0;
  const gutterRightPx = isLg ? 20 * viewport.rem : 0;
  const hubShellWidthPx = Math.max(0, viewport.w - gutterLeftPx - gutterRightPx);

  /** Insets scroll/composer above the floating ExpandedTabs; shell still runs to viewport bottom */
  const dockContentPad =
    "pb-[max(6.25rem,calc(1.25rem+4.5rem+env(safe-area-inset-bottom,0px)))]";

  const isSideDock = !isHub && isLg;
  const minChatWidthPx = 320;
  const chatBoundsLeft = isLg && isHub ? gutterLeftPx : 0;
  const chatBoundsRight = isLg ? viewport.w - (isHub ? gutterRightPx : 0) : viewport.w;
  const chatLaneWidthPx = Math.max(minChatWidthPx, chatBoundsRight - chatBoundsLeft);
  const nonHubMaxWidthPx = Math.floor(viewport.w * 0.75);
  const maxChatWidthPx =
    isLg && !isHub
      ? Math.max(minChatWidthPx, Math.min(chatLaneWidthPx, nonHubMaxWidthPx))
      : chatLaneWidthPx;

  const defaultChatRect = useMemo(() => {
    const defaultWidth = isHub ? Math.min(672, Math.max(320, hubShellWidthPx - 32)) : 420;
    const width = Math.min(defaultWidth, maxChatWidthPx);
    const left = isHub ? gutterLeftPx + Math.max(0, (hubShellWidthPx - width) / 2) : Math.max(chatBoundsLeft, chatBoundsRight - width);
    return { left, width };
  }, [chatBoundsLeft, chatBoundsRight, gutterLeftPx, hubShellWidthPx, isHub, maxChatWidthPx]);

  useEffect(() => {
    setChatRect((prev) => {
      const base = prev ?? defaultChatRect;
      const width = Math.min(Math.max(base.width, minChatWidthPx), maxChatWidthPx);
      const left = Math.min(Math.max(base.left, chatBoundsLeft), chatBoundsRight - width);
      return { left, width };
    });
  }, [chatBoundsLeft, chatBoundsRight, defaultChatRect, maxChatWidthPx]);

  const coinPanelWidthPx = coinInsightsWide ? 480 : 304;
  const coinPanelPx = coinInsightsOpen ? coinPanelWidthPx : 0;
  const hubChatBodyW = chatRect?.width ?? Math.min(672, Math.max(280, hubShellWidthPx - 32));
  const hubCenterX = gutterLeftPx + hubShellWidthPx / 2;
  const hubChatLeft = chatRect?.left ?? hubCenterX - hubChatBodyW / 2;
  const hubCoinLeftPx =
    isHub && isLg && coinInsightsOpen
      ? Math.max(8, hubChatLeft - coinPanelPx - 12)
      : null;

  const sideDockWidth = chatRect?.width ?? 420;
  const sideDockInset = sideDockWidth + (coinInsightsOpen ? coinPanelPx : 0);
  const isSideDockOnLeft =
    isSideDock && isLg && chatRect != null
      ? chatRect.left + chatRect.width / 2 < viewport.w / 2
      : false;

  const toggleWidth = 36;
  const toggleLeftBound = chatBoundsLeft + 8;
  const toggleRightBound = chatBoundsRight - toggleWidth - 8;
  const toggleTop = Math.max(8, topInset - 34);
  const coinToggleWidth = 36;
  const coinToggleTop = Math.max(8, topInset - 34);
  const coinToggleLeftBound = toggleLeftBound;
  const coinToggleRightBound = toggleRightBound;
  const selectedTokenPinned = isTokenPinned(selectedSymbol);
  const pinnedSelectedToken = pinnedTokens.find((token) => token.symbol === selectedSymbol) ?? null;
  const showCoinRailToken = isLg && (coinInsightsOpen || selectedTokenPinned);

  useEffect(() => {
    setToggleLeft((prev) => {
      const centered =
        chatRect != null ? chatRect.left + chatRect.width / 2 - toggleWidth / 2 : (viewport.w - toggleWidth) / 2;
      const next = prev ?? centered;
      return Math.min(Math.max(next, toggleLeftBound), toggleRightBound);
    });
  }, [chatRect, toggleLeftBound, toggleRightBound, viewport.w]);

  const clampToggleLeft = (value: number) =>
    Math.min(Math.max(value, toggleLeftBound), toggleRightBound);
  const clampCoinToggleLeft = (value: number) =>
    Math.min(Math.max(value, coinToggleLeftBound), coinToggleRightBound);

  const moveChatAndToggle = (nextToggleLeft: number, dragDirection: "left" | "right" | null = null) => {
    if (!isLg) {
      setToggleLeft(clampToggleLeft(nextToggleLeft));
      return;
    }

    setChatRect((prev) => {
      if (!prev) {
        setToggleLeft(clampToggleLeft(nextToggleLeft));
        return prev;
      }

      if (!isHub) {
        const clampedToggleLeft = clampToggleLeft(nextToggleLeft);
        const snapLeft = chatBoundsLeft;
        const snapRight = chatBoundsRight - prev.width;
        const nextSide =
          dragDirection === "left"
            ? "left"
            : dragDirection === "right"
              ? "right"
              : clampedToggleLeft + toggleWidth / 2 < viewport.w / 2
                ? "left"
                : "right";
        const nextLeft = nextSide === "left" ? snapLeft : snapRight;
        pageSnapSideRef.current[pathname] = nextSide;
        setToggleLeft(clampToggleLeft(nextToggleLeft));
        return { ...prev, left: nextLeft };
      }

      const minToggleForChat = chatBoundsLeft + prev.width / 2 - toggleWidth / 2;
      const maxToggleForChat = chatBoundsRight - prev.width / 2 - toggleWidth / 2;
      const clampedToggleLeft = Math.min(
        Math.max(nextToggleLeft, minToggleForChat),
        maxToggleForChat,
      );
      const targetChatLeft = clampedToggleLeft + toggleWidth / 2 - prev.width / 2;
      const left = Math.min(Math.max(targetChatLeft, chatBoundsLeft), chatBoundsRight - prev.width);
      setToggleLeft(clampedToggleLeft);
      return { ...prev, left };
    });
  };

  useEffect(() => {
    if (userMovedToggleRef.current) return;
    if (!chatRect) return;
    const centered = chatRect.left + chatRect.width / 2 - toggleWidth / 2;
    setToggleLeft(clampToggleLeft(centered));
  }, [chatRect, toggleWidth]);

  useEffect(() => {
    if (!showCoinRailToken) return;
    const defaultPanelLeft = isHub && hubCoinLeftPx != null
      ? hubCoinLeftPx
      : viewport.w - sideDockWidth - coinPanelWidthPx;
    setCoinPanelLeft((prev) => {
      const next = prev ?? defaultPanelLeft;
      return Math.min(Math.max(next, chatBoundsLeft), chatBoundsRight - coinPanelWidthPx);
    });
    const centered = defaultPanelLeft + coinPanelWidthPx / 2 - coinToggleWidth / 2;
    setCoinToggleLeft((prev) => {
      const next = prev ?? centered;
      return clampCoinToggleLeft(next);
    });
  }, [
    chatBoundsLeft,
    chatBoundsRight,
    coinPanelWidthPx,
    hubCoinLeftPx,
    isHub,
    sideDockWidth,
    viewport.w,
    showCoinRailToken,
  ]);

  useEffect(() => {
    if (coinInsightsOpen || selectedTokenPinned) return;
    setCoinPanelLeft(null);
    setCoinToggleLeft(null);
  }, [coinInsightsOpen, selectedTokenPinned]);

  useEffect(() => {
    if (!showCoinRailToken || coinPanelLeft == null) return;
    const centeredToggleLeft = coinPanelLeft + coinPanelWidthPx / 2 - coinToggleWidth / 2;
    setCoinToggleLeft((prev) => {
      const next = clampCoinToggleLeft(centeredToggleLeft);
      return prev == null || Math.abs(prev - next) > 0.5 ? next : prev;
    });
  }, [showCoinRailToken, coinPanelLeft, coinPanelWidthPx]);

  useEffect(() => {
    userMovedToggleRef.current = false;
    if (!chatRect) return;
    const centered = chatRect.left + chatRect.width / 2 - toggleWidth / 2;
    setToggleLeft(clampToggleLeft(centered));
  }, [pathname, isLg]);

  useEffect(() => {
    if (!isLg || !chatRect) return;

    if (isHub) {
      const left = Math.min(
        Math.max(gutterLeftPx + (hubShellWidthPx - chatRect.width) / 2, chatBoundsLeft),
        chatBoundsRight - chatRect.width,
      );
      const centeredToggleLeft = left + chatRect.width / 2 - toggleWidth / 2;
      if (Math.abs(left - chatRect.left) > 0.5) {
        setChatRect({ ...chatRect, left });
      }
      setToggleLeft((prev) => {
        const next = clampToggleLeft(centeredToggleLeft);
        return prev == null || Math.abs(prev - next) > 0.5 ? next : prev;
      });
      return;
    }

    const rememberedSide = pageSnapSideRef.current[pathname] ?? "right";
    const left = rememberedSide === "left" ? chatBoundsLeft : chatBoundsRight - chatRect.width;
    const centeredToggleLeft = left + chatRect.width / 2 - toggleWidth / 2;
    if (Math.abs(left - chatRect.left) > 0.5) {
      setChatRect({ ...chatRect, left });
    }
    setToggleLeft((prev) => {
      const next = clampToggleLeft(centeredToggleLeft);
      return prev == null || Math.abs(prev - next) > 0.5 ? next : prev;
    });
  }, [
    chatBoundsLeft,
    chatBoundsRight,
    chatRect,
    gutterLeftPx,
    hubShellWidthPx,
    isHub,
    isLg,
    pathname,
    toggleWidth,
  ]);

  const handleToggleDragStart = (_event: DragStartEvent) => {
    toggleDragStartLeftRef.current = toggleLeft ?? toggleLeftBound;
    hasDraggedToggleRef.current = false;
  };

  const handleToggleDragMove = (event: DragMoveEvent) => {
    const dx = event.delta.x;
    if (Math.abs(dx) > 3) {
      hasDraggedToggleRef.current = true;
      userMovedToggleRef.current = true;
    }
    moveChatAndToggle(
      toggleDragStartLeftRef.current + dx,
      dx < 0 ? "left" : dx > 0 ? "right" : null,
    );
  };

  const handleToggleDragEnd = (event: DragEndEvent) => {
    const dx = event.delta.x;
    moveChatAndToggle(
      toggleDragStartLeftRef.current + dx,
      dx < 0 ? "left" : dx > 0 ? "right" : null,
    );
  };

  const handleTogglePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerToggleDragRef.current = {
      startX: event.clientX,
      startLeft: toggleLeft ?? toggleLeftBound,
      moved: false,
    };
  };

  const handleTogglePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerToggleDragRef.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    if (Math.abs(dx) > 3) {
      state.moved = true;
      hasDraggedToggleRef.current = true;
      userMovedToggleRef.current = true;
    }
    moveChatAndToggle(
      state.startLeft + dx,
      dx < 0 ? "left" : dx > 0 ? "right" : null,
    );
  };

  const handleTogglePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerToggleDragRef.current;
    if (!state) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerToggleDragRef.current = null;
    if (state.moved) return;
    setChatOpen(!chatOpen);
  };

  const handleCoinTogglePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    coinPointerDragRef.current = {
      startX: event.clientX,
      startLeft: coinToggleLeft ?? coinToggleLeftBound,
      moved: false,
    };
  };

  const handleCoinTogglePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = coinPointerDragRef.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    if (Math.abs(dx) > 3) state.moved = true;
    const nextToggleLeft = clampCoinToggleLeft(state.startLeft + dx);
    setCoinToggleLeft(nextToggleLeft);
    const targetPanelLeft = nextToggleLeft + coinToggleWidth / 2 - coinPanelWidthPx / 2;
    const nextPanelLeft = Math.min(
      Math.max(targetPanelLeft, chatBoundsLeft),
      chatBoundsRight - coinPanelWidthPx,
    );
    setCoinPanelLeft(nextPanelLeft);
  };

  const handleCoinTogglePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = coinPointerDragRef.current;
    if (!state) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    coinPointerDragRef.current = null;
    if (state.moved) return;
    if (!coinInsightsOpen) {
      openCoinInsights(selectedSymbol, pinnedSelectedToken?.label ?? null);
    }
  };

  const handleResizeStart = (side: "left" | "right") => (event: React.PointerEvent<HTMLDivElement>) => {
    if (!chatRect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStateRef.current = {
      side,
      startX: event.clientX,
      startLeft: chatRect.left,
      startWidth: chatRect.width,
    };
  };

  const handleResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = resizeStateRef.current;
    if (!state) return;
    const dx = event.clientX - state.startX;

    if (state.side === "right") {
      const width = Math.min(
        Math.max(state.startWidth + dx, minChatWidthPx),
        Math.min(chatBoundsRight - state.startLeft, maxChatWidthPx),
      );
      const centeredToggleLeft = state.startLeft + width / 2 - toggleWidth / 2;
      setToggleLeft(clampToggleLeft(centeredToggleLeft));
      setChatRect({ left: state.startLeft, width });
      return;
    }

    const right = state.startLeft + state.startWidth;
    const width = Math.min(
      Math.max(state.startWidth - dx, minChatWidthPx),
      Math.min(maxChatWidthPx, right - chatBoundsLeft),
    );
    const left = right - width;
    const centeredToggleLeft = left + width / 2 - toggleWidth / 2;
    setToggleLeft(clampToggleLeft(centeredToggleLeft));
    setChatRect({ left, width });
  };

  const handleResizeEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeStateRef.current = null;
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className={cn("flex min-h-0 flex-1 flex-col overflow-hidden")}
        style={
          chatOpen && isSideDock && isLg
            ? isSideDockOnLeft
              ? ({ marginInlineStart: sideDockInset } satisfies CSSProperties)
              : ({ marginInlineEnd: sideDockInset } satisfies CSSProperties)
            : undefined
        }
      >
        {children}
      </div>

      {chatOpen ? (
        <motion.div
          className={cn(
            "fixed z-40 flex flex-col overflow-hidden",
            !isHub &&
              "border-border-subtle border-s bg-background/96 shadow-[0_0_0_1px_rgba(255,255,255,0.04),-12px_0_40px_-16px_rgba(0,0,0,0.65)] backdrop-blur-md lg:rounded-ss-sm",
          )}
          initial={false}
          animate={
            isHub
              ? isLg
                ? {
                    left: chatRect?.left ?? defaultChatRect.left,
                    width: chatRect?.width ?? defaultChatRect.width,
                    top: topInset,
                    bottom: 0,
                    right: "auto",
                    height: "auto",
                  }
                : {
                    left: 0,
                    width: viewport.w,
                    top: topInset,
                    bottom: 0,
                    right: "auto",
                    height: "auto",
                  }
              : isSideDock
                ? {
                    left: chatRect?.left ?? defaultChatRect.left,
                    width: chatRect?.width ?? defaultChatRect.width,
                    top: topInset,
                    bottom: 0,
                    right: "auto",
                    height: "auto",
                  }
                : ({
                    left: 0,
                    width: viewport.w,
                    top: "auto",
                    bottom: 0,
                    right: "auto",
                    height: "min(52dvh, 420px)",
                  } satisfies CSSProperties)
          }
          transition={dockTransition}
        >
          {isLg ? (
            <div
              className="-left-1.5 pointer-events-auto absolute inset-y-0 z-20 w-3 cursor-ew-resize"
              role="separator"
              tabIndex={0}
              aria-label="Resize AI chat from left edge"
              onPointerDown={handleResizeStart("left")}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
            />
          ) : null}
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
              dockContentPad,
              isHub &&
                "pointer-events-auto mx-auto h-full w-full border-border-subtle border-x bg-background/96 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-md",
              !isHub && "h-full min-h-0",
            )}
          >
            <ChatPanel hub className="min-h-0 flex-1" onClose={() => setChatOpen(false)} />
          </div>
          {isLg ? (
            <div
              className="-right-1.5 pointer-events-auto absolute inset-y-0 z-20 w-3 cursor-ew-resize"
              role="separator"
              tabIndex={0}
              aria-label="Resize AI chat from right edge"
              onPointerDown={handleResizeStart("right")}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
            />
          ) : null}
        </motion.div>
      ) : null}

      {coinInsightsOpen ? (
        <CoinInsightsPanel
          topInset={topInset}
          hubCoinLeftPx={hubCoinLeftPx}
          dockAdjacent={isSideDock}
          dockRightPx={sideDockWidth}
          coinWidthPx={coinPanelPx}
          floatingLeftPx={coinPanelLeft}
        />
      ) : null}

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <ExpandedTabs tabs={navTabs} />
        </div>
      </div>

      {showCoinRailToken ? (
        <div className="pointer-events-none fixed inset-x-0 z-50" style={{ top: coinToggleTop }}>
          <div className="relative mx-auto h-9 w-full">
            <div
              className="pointer-events-auto absolute h-9 w-9 touch-none"
              style={{ left: coinToggleLeft ?? coinToggleLeftBound }}
              onPointerDown={handleCoinTogglePointerDown}
              onPointerMove={handleCoinTogglePointerMove}
              onPointerUp={handleCoinTogglePointerUp}
              onPointerCancel={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                coinPointerDragRef.current = null;
              }}
            >
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="h-9 w-9 touch-none rounded-full border-border-subtle bg-background/90 font-mono text-[10px] text-foreground uppercase shadow-[0_4px_22px_rgba(0,0,0,0.45)] backdrop-blur-md"
                aria-label={`${selectedSymbol} coin console toggle`}
              >
                {selectedSymbol.slice(0, 3)}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none fixed inset-x-0 z-50" style={{ top: toggleTop }}>
        <div className="relative mx-auto h-9 w-full">
          <DndContext
            sensors={dragSensors}
            onDragStart={handleToggleDragStart}
            onDragMove={handleToggleDragMove}
            onDragEnd={handleToggleDragEnd}
          >
            <div
              ref={setToggleDragNodeRef}
              className="pointer-events-auto absolute h-9 w-9 touch-none"
              style={{ left: toggleLeft ?? toggleLeftBound }}
              onPointerDown={handleTogglePointerDown}
              onPointerMove={handleTogglePointerMove}
              onPointerUp={handleTogglePointerUp}
              onPointerCancel={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                pointerToggleDragRef.current = null;
              }}
            >
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="h-9 w-9 touch-none rounded-full border-border-subtle bg-background/90 text-foreground shadow-[0_4px_22px_rgba(0,0,0,0.45)] backdrop-blur-md"
              aria-label={chatOpen ? "Close AI chat" : "Open AI chat"}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  setToggleLeft((prev) => clampToggleLeft((prev ?? toggleLeftBound) - 24));
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setToggleLeft((prev) => clampToggleLeft((prev ?? toggleLeftBound) + 24));
                }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setChatOpen(!chatOpen);
                  }
              }}
                {...toggleDragListeners}
                {...toggleDragAttributes}
            >
              <Bot className="size-4" aria-hidden />
              </Button>
            </div>
          </DndContext>
        </div>
      </div>
    </div>
  );
};
