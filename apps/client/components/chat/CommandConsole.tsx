"use client";

import { useAui } from "@assistant-ui/react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "darkflow_recent_cmds";

const COMMANDS: { label: string; prompt: string; description: string }[] = [
  {
    label: "Meme scan",
    prompt: "Scan early meme coins with elevated volume — mock flow.",
    description: "Rotation + liquidity",
  },
  {
    label: "Whale pulse",
    prompt: "Show whale activity and large-wallet bias on SOL ecosystem (sim).",
    description: "Flow + concentration",
  },
  {
    label: "Risk-off",
    prompt: "What’s the safer basket if funding goes hostile? (mock)",
    description: "Defensive names",
  },
  {
    label: "Pump radar",
    prompt: "What’s pumping hardest on the watchlist right now?",
    description: "Momentum stack",
  },
  {
    label: "Perp heat",
    prompt: "Summarize perp heat: liquidations, OI, skew (paper tape).",
    description: "Derivatives tone",
  },
  {
    label: "Funding map",
    prompt: "Map funding extremes vs spot basis across majors (mock).",
    description: "Carry + basis",
  },
  {
    label: "Launch sniper",
    prompt: "Any fresh launches or router spikes I should fade or chase?",
    description: "New pools",
  },
  {
    label: "Vol crush",
    prompt: "Where is vol getting crushed vs realized move?",
    description: "Volatility",
  },
];

const readRecent = (): string[] => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]).slice(0, 6) : [];
  } catch {
    return [];
  }
};

const writeRecent = (text: string) => {
  try {
    const prev = readRecent();
    const next = [text, ...prev.filter((x) => x !== text)].slice(0, 6);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("darkflow-recent-cmds"));
  } catch {
    /* ignore */
  }
};

export const CommandConsoleChips = ({ className }: { className?: string }) => {
  const aui = useAui();

  const handleSend = useCallback(
    (prompt: string) => {
      writeRecent(prompt);
      aui.thread().append(prompt);
    },
    [aui],
  );

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      <p className="ps-0.5 font-mono text-[9px] text-muted-foreground uppercase tracking-[0.2em]">
        Market commands
      </p>
      <div className="flex w-full flex-wrap gap-1">
        {COMMANDS.map((c, i) => (
          <motion.button
            key={c.label}
            type="button"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02, type: "spring", stiffness: 420, damping: 28 }}
            className={cn(
              "rounded-sm border border-border-subtle bg-black/45 px-2 py-1 font-mono text-[10px] text-foreground leading-none",
              "outline-none transition-colors hover:border-white/14 hover:bg-white/[0.05] focus-visible:border-primary/40 focus-visible:ring-1 focus-visible:ring-primary/30",
            )}
            title={c.description}
            onClick={() => handleSend(c.prompt)}
            aria-label={`Send command: ${c.label}. ${c.description}`}
          >
            {c.label}
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export const RecentCommandsStrip = ({ className }: { className?: string }) => {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setItems(readRecent());
    sync();
    window.addEventListener("darkflow-recent-cmds", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("darkflow-recent-cmds", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-sm border border-border-subtle bg-black/35 px-2 py-1",
        className,
      )}
    >
      <p className="mb-0.5 font-mono text-[8px] text-muted-foreground uppercase tracking-wider">
        Recent
      </p>
      <ul className="flex max-h-[4.5rem] flex-col gap-0.5 overflow-y-auto">
        {items.map((t) => (
          <li
            key={t}
            className="truncate font-mono text-[9px] text-signal/90 leading-tight"
            title={t}
          >
            ▸ {t}
          </li>
        ))}
      </ul>
    </div>
  );
};
