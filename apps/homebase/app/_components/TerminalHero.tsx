"use client";

import { motion } from "framer-motion";

import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/** Decorative OHLC-style bars for hero preview only (not real time series). */
const PREVIEW_CANDLES = [
  { cx: 14, wickTop: 22, wickBot: 78, bodyTop: 38, bodyH: 28, bull: true },
  { cx: 34, wickTop: 28, wickBot: 82, bodyTop: 44, bodyH: 22, bull: false },
  { cx: 54, wickTop: 34, wickBot: 86, bodyTop: 52, bodyH: 18, bull: false },
  { cx: 74, wickTop: 40, wickBot: 88, bodyTop: 58, bodyH: 20, bull: true },
  { cx: 94, wickTop: 32, wickBot: 84, bodyTop: 48, bodyH: 24, bull: true },
  { cx: 114, wickTop: 26, wickBot: 80, bodyTop: 40, bodyH: 30, bull: true },
  { cx: 134, wickTop: 30, wickBot: 86, bodyTop: 50, bodyH: 22, bull: false },
  { cx: 154, wickTop: 36, wickBot: 90, bodyTop: 56, bodyH: 20, bull: true },
  { cx: 174, wickTop: 24, wickBot: 82, bodyTop: 42, bodyH: 26, bull: true },
  { cx: 194, wickTop: 20, wickBot: 76, bodyTop: 34, bodyH: 32, bull: true },
] as const;

const TAPE_PREVIEW = [
  { time: "09:41:02", px: "411.08", sz: "240", ask: false },
  { time: "09:41:02", px: "411.06", sz: "120", ask: true },
  { time: "09:41:03", px: "411.04", sz: "800", ask: true },
  { time: "09:41:03", px: "411.10", sz: "160", ask: false },
  { time: "09:41:04", px: "411.12", sz: "400", ask: false },
  { time: "09:41:04", px: "411.09", sz: "90", ask: true },
] as const;

const HeroDeskSnapshot = () => (
  <div
    className="pointer-events-none flex min-h-0 flex-1 flex-col"
    role="img"
    aria-label="Decorative desk preview: candle chart, level tags, and time and sales column. Simulated only, not live market data."
  >
    <p className="mb-3 shrink-0 border-b border-border/60 pb-2 text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
      desk snapshot · simulated
    </p>

    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_7.25rem] sm:gap-4">
      <div className="flex min-h-0 flex-col gap-2">
        <div className="relative flex-1 rounded-md border border-border/45 bg-background/30 px-1 pt-2">
          <svg
            viewBox="0 0 220 88"
            className="mx-auto block h-[min(140px,28vw)] w-full max-w-[280px] sm:h-[132px] sm:max-w-none"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <line
              x1="8"
              y1="44"
              x2="212"
              y2="44"
              className="stroke-border/60"
              strokeWidth="0.5"
              strokeDasharray="3 4"
            />
            {PREVIEW_CANDLES.map((c) => (
              <g key={c.cx}>
                <line
                  x1={c.cx}
                  y1={c.wickTop}
                  x2={c.cx}
                  y2={c.wickBot}
                  className={c.bull ? "stroke-primary/80" : "stroke-destructive/75"}
                  strokeWidth="1.25"
                />
                <rect
                  x={c.cx - 3.5}
                  y={c.bodyTop}
                  width="7"
                  height={c.bodyH}
                  rx="0.75"
                  className={c.bull ? "fill-primary/75" : "fill-destructive/70"}
                />
              </g>
            ))}
          </svg>
        </div>
        <div className="flex flex-wrap gap-1.5 font-mono text-[10px] text-muted-foreground">
          <span className="rounded border border-border/50 bg-muted/10 px-1.5 py-0.5 text-foreground/80">
            ORH 412.80
          </span>
          <span className="rounded border border-border/50 bg-muted/10 px-1.5 py-0.5 text-foreground/80">
            VWAP 411.06
          </span>
          <span className="rounded border border-border/50 bg-muted/10 px-1.5 py-0.5 text-foreground/80">
            Open 410.22
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-col rounded-md border border-border/45 bg-background/40 p-2">
        <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          time &amp; sales
        </p>
        <ul className="flex flex-1 flex-col justify-center gap-1 font-mono text-[10px] leading-tight">
          {TAPE_PREVIEW.map((row, i) => (
            <li
              key={`tape-${i}-${row.px}`}
              className="flex justify-between gap-1 border-b border-border/25 border-dotted pb-0.5 last:border-0"
            >
              <span className="shrink-0 text-muted-foreground">{row.time}</span>
              <span
                className={
                  row.ask ? "text-destructive/90" : "text-primary"
                }
              >
                {row.px}
              </span>
              <span className="shrink-0 text-right text-muted-foreground">{row.sz}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>

    <p className="mt-3 shrink-0 text-center font-mono text-[10px] text-primary sm:text-left">
      Join waitlist · early desk access
    </p>
  </div>
);

const TerminalHero = () => {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <section
      className="px-6 pb-10 pt-14 sm:pb-16 sm:pt-20"
      aria-labelledby="hero-heading"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
        <motion.div
          className="flex flex-col gap-6 text-center sm:gap-7 sm:text-left lg:pt-1"
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="font-mono text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase sm:text-xs sm:tracking-[0.2em]">
            DARKFLOW // INTENT-FIRST TRADING
          </p>
          <h1
            id="hero-heading"
            className="font-heading text-balance text-6xl font-extrabold leading-[1.02] tracking-tighter text-foreground sm:text-5xl md:text-6xl"
          >
            <span className="block">
              Stop herding{" "}
              <span className="hb-text-metallic">tabs</span>
              <span className="text-primary">.</span>
            </span>
            <span className="mt-1 block sm:mt-2">
              Start making{" "}
              <span className="hb-text-metallic">trades</span>
              <span className="text-primary">.</span>
            </span>
          </h1>
          <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            One aggressive hub: chart, tape, and intel locked beside a thread that
            actually answers back—type what you want the desk to do, watch the UI
            move with you. We&apos;re opening early access because the old workflow
            is done.
          </p>
        </motion.div>

        {/* <motion.div
          className="hb-glass flex min-h-[260px] flex-col overflow-hidden rounded-xl p-4 font-mono text-[13px] leading-relaxed sm:min-h-[300px] sm:p-5 lg:min-h-[320px]"
          initial={reducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
        >
          <HeroDeskSnapshot />
        </motion.div> */}
      </div>
    </section>
  );
};

export { TerminalHero };
