"use client";

import { motion } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";

import { TapeMarquee } from "./TapeMarquee";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const DeskRailsSvg = () => (
  <svg
    viewBox="0 0 200 100"
    className="h-20 w-full text-muted-foreground"
    aria-hidden="true"
  >
    <rect x="12" y="16" width="52" height="68" rx="4" fill="currentColor" opacity="0.12" />
    <rect x="74" y="16" width="52" height="68" rx="4" fill="currentColor" opacity="0.1" />
    <rect x="136" y="16" width="52" height="68" rx="4" fill="currentColor" opacity="0.08" />
    <rect x="20" y="24" width="36" height="4" rx="1" fill="currentColor" opacity="0.35" />
    <rect x="82" y="24" width="36" height="4" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="144" y="24" width="36" height="4" rx="1" fill="currentColor" opacity="0.25" />
    <rect x="20" y="36" width="36" height="3" fill="currentColor" opacity="0.15" />
    <rect x="20" y="44" width="36" height="3" fill="currentColor" opacity="0.12" />
    <rect x="82" y="36" width="36" height="3" fill="currentColor" opacity="0.14" />
    <rect x="82" y="44" width="36" height="3" fill="currentColor" opacity="0.11" />
    <rect x="144" y="36" width="36" height="3" fill="currentColor" opacity="0.12" />
    <rect x="144" y="44" width="36" height="3" fill="currentColor" opacity="0.09" />
    <rect x="88" y="72" width="24" height="6" rx="2" className="fill-primary/35" />
  </svg>
);

const ResearchThreadMock = () => (
  <div
    className="flex min-h-[168px] flex-1 flex-col rounded-lg border border-border/50 bg-background/35 p-3 sm:min-h-[188px]"
    role="img"
    aria-label="Illustration of a research thread: sample questions and desk replies. Simulated, not live data."
  >
    <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
      thread preview · simulated
    </p>
    <div className="mt-2 flex min-h-0 flex-1 flex-col justify-center gap-2">
      <div className="rounded-md border border-border/45 bg-muted/10 px-2.5 py-2">
        <p className="font-mono text-[10px] text-muted-foreground">You</p>
        <p className="mt-0.5 text-left text-xs leading-snug text-foreground/90">
          Session high, VWAP, and where we opened—on this name.
        </p>
      </div>
      <div className="rounded-md border border-primary/30 bg-primary/[0.06] px-2.5 py-2">
        <p className="font-mono text-[10px] text-primary">Desk</p>
        <p className="mt-0.5 text-left text-xs leading-snug text-foreground/85">
          ORH 412.80 · VWAP 411.06 · day open 410.22. Prints since the open stack
          above VWAP—size only if your risk still fits (simulated).
        </p>
      </div>
      <div className="rounded-md border border-border/45 bg-muted/10 px-2.5 py-2">
        <p className="font-mono text-[10px] text-muted-foreground">You</p>
        <p className="mt-0.5 text-left text-xs leading-snug text-foreground/90">
          What would you double-check before I add?
        </p>
      </div>
    </div>
  </div>
);

const BentoSection = () => {
  const reducedMotion = usePrefersReducedMotion();
  const motionProps = {
    initial: reducedMotion ? (false as const) : ({ opacity: 0, y: 8 } as const),
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-40px" as const },
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  };

  return (
    <section
      id="desk"
      className="border-t border-border/60 px-6 py-16 sm:py-20"
      aria-labelledby="desk-heading"
    >
      <div className="mx-auto max-w-6xl">
        <h2
          id="desk-heading"
          className="font-heading text-center text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          Chart, chat, and tape—one screen
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-muted-foreground sm:text-base">
          Darkflow is laid out like the terminals you already trade from: a
          thread for orders and research beside your chart and context, plus a
          tape and scanner rail so prints, liquidity, and headlines stay in view
          while you size and manage risk—without bouncing between tabs.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-6 md:grid-rows-2">
          <motion.div
            className="md:col-span-3 md:row-span-2"
            initial={motionProps.initial}
            whileInView={motionProps.whileInView}
            viewport={motionProps.viewport}
            transition={{ ...motionProps.transition, delay: 0 }}
          >
            <Card className="hb-glass flex h-full min-h-[300px] flex-col border-border/60 bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-base">
                  Research thread
                </CardTitle>
                <p className="font-mono text-[11px] text-muted-foreground">
                  plain-language asks · levels &amp; context · keyboard shortcuts
                </p>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-0">
                <p className="shrink-0 text-sm leading-relaxed text-muted-foreground">
                  Ask for VWAP and opening range, a quick news pass, or a second opinion
                  on size before you send. The thread sits beside chart and tape so you
                  are not flipping tabs while the book is moving.
                </p>
                <ResearchThreadMock />
                <div className="shrink-0 rounded-lg border border-border/50 bg-background/40 p-3 font-mono text-sm leading-relaxed text-foreground/90">
                  &gt; This symbol: mark session high and VWAP, recap prints since the
                  open, and list what I&apos;d verify before adding size.
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            className="md:col-span-3"
            initial={motionProps.initial}
            whileInView={motionProps.whileInView}
            viewport={motionProps.viewport}
            transition={{ ...motionProps.transition, delay: 0.06 }}
          >
            <Card className="hb-glass flex h-full flex-col overflow-hidden border-border/60 bg-card/40 p-0">
              <CardHeader className="border-b border-border/40 px-4 pb-3 pt-4">
                <CardTitle className="font-heading text-base">
                  Chart &amp; context dock
                </CardTitle>
                <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  The price chart and context dock stay pinned beside the thread so
                  you&apos;re never guessing which window had the truth last.
                </p>
              </CardHeader>
              <CardContent className="flex-1 p-3 pt-0">
                <TapeMarquee />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            className="md:col-span-3"
            initial={motionProps.initial}
            whileInView={motionProps.whileInView}
            viewport={motionProps.viewport}
            transition={{ ...motionProps.transition, delay: 0.1 }}
          >
            <Card className="hb-glass h-full border-border/60 bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-base">
                  Signals &amp; desk rails
                </CardTitle>
                <p className="font-mono text-[11px] text-muted-foreground">
                  scanners · tape column · hub layout
                </p>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <DeskRailsSvg />
                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                  Built for traders who want Bloomberg-grade density without giving up
                  a modern, keyboard-first layout—everything stays in one flow state.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export { BentoSection };
