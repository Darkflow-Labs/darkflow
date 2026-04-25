"use client";

import { motion } from "framer-motion";
import { LineChart, Radar, SquareTerminal, Wallet } from "lucide-react";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { CoinInsightsPanel } from "@/components/coin/CoinInsightsPanel";
import { ExpandedTabs, type TabItem } from "@/components/nav/ExpandedTabs";
import { useTerminal } from "@/components/layout/TerminalState";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";

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
  const { coinInsightsOpen, coinInsightsWide } = useTerminal();
  const [topInset, setTopInset] = useState(48);

  useLayoutEffect(() => {
    const measure = () => {
      const el = document.getElementById("desk-app-header");
      if (el) {
        setTopInset(el.getBoundingClientRect().bottom);
        return;
      }
      setTopInset(48);
    };

    measure();
    const el = document.getElementById("desk-app-header");
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
  const sideDockLeftPx = Math.max(0, viewport.w - 420);

  /** Insets scroll/composer above the floating ExpandedTabs; shell still runs to viewport bottom */
  const dockContentPad =
    "pb-[max(6.25rem,calc(1.25rem+4.5rem+env(safe-area-inset-bottom,0px)))]";

  const isSideDock = !isHub && isLg;

  const coinPanelPx = coinInsightsOpen ? (coinInsightsWide ? 480 : 304) : 0;
  const hubChatBodyW = Math.min(672, Math.max(280, hubShellWidthPx - 32));
  const hubCenterX = gutterLeftPx + hubShellWidthPx / 2;
  const hubChatLeft = hubCenterX - hubChatBodyW / 2;
  const hubCoinLeftPx =
    isHub && isLg && coinInsightsOpen
      ? Math.max(8, hubChatLeft - coinPanelPx - 12)
      : null;

  const mainMarginEndLg =
    isSideDock && isLg ? 420 + (coinInsightsOpen ? coinPanelPx : 0) : undefined;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className={cn("flex min-h-0 flex-1 flex-col overflow-hidden")}
        style={
          mainMarginEndLg != null
            ? ({ marginInlineEnd: mainMarginEndLg } satisfies CSSProperties)
            : undefined
        }
      >
        {children}
      </div>

      <motion.div
        className={cn(
          "fixed z-40 flex flex-col overflow-hidden",
          isHub && "pointer-events-none",
          !isHub &&
            "border-border-subtle border-s bg-background/96 shadow-[0_0_0_1px_rgba(255,255,255,0.04),-12px_0_40px_-16px_rgba(0,0,0,0.65)] backdrop-blur-md lg:rounded-ss-sm",
        )}
        initial={false}
        animate={
          isHub
            ? isLg
              ? {
                  left: gutterLeftPx,
                  width: hubShellWidthPx,
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
                  left: sideDockLeftPx,
                  width: 420,
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
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
            dockContentPad,
            isHub &&
              "pointer-events-auto mx-auto h-full w-full max-w-2xl border-border-subtle border-x bg-background/96 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-md",
            !isHub && "h-full min-h-0",
          )}
        >
          <ChatPanel hub className="min-h-0 flex-1" />
        </div>
      </motion.div>

      {coinInsightsOpen ? (
        <CoinInsightsPanel
          topInset={topInset}
          hubCoinLeftPx={hubCoinLeftPx}
          dockAdjacent={isSideDock}
          coinWidthPx={coinPanelPx}
        />
      ) : null}

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-3">
        <div className="pointer-events-auto">
          <ExpandedTabs tabs={navTabs} />
        </div>
      </div>
    </div>
  );
};
