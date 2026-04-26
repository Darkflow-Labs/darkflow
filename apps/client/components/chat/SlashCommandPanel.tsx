"use client";

import { useAui, useAuiState } from "@assistant-ui/react";

const COMMANDS: { prefix: string; label: string; prompt: string }[] = [
  {
    prefix: "/buy",
    label: "/buy",
    prompt: "Simulate a market buy on the selected watchlist name (mock).",
  },
  {
    prefix: "/chart",
    label: "/chart",
    prompt: "Open analysis: show key levels and flow for the active symbol (mock).",
  },
  {
    prefix: "/scan",
    label: "/scan",
    prompt: "Scan the mock universe for momentum and liquidity traps.",
  },
];

export const SlashCommandPanel = () => {
  const aui = useAui();
  const text = useAuiState((s) => s.composer.text ?? "");

  if (!text.startsWith("/")) return null;

  const needle = text.trim().toLowerCase();
  const matches = COMMANDS.filter(
    (c) => needle === "/" || c.prefix.toLowerCase().startsWith(needle),
  ).slice(0, 8);

  if (matches.length === 0) return null;

  const handlePick = (prompt: string) => {
    aui.composer().setText("");
    aui.thread().append(prompt);
  };

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-20 mb-1.5 overflow-hidden rounded-sm border border-border-subtle bg-popover shadow-md"
      role="listbox"
      aria-label="Slash commands"
    >
      <ul className="max-h-48 overflow-y-auto py-0.5">
        {matches.map((c) => (
          <li key={c.prefix}>
            <button
              type="button"
              className="flex w-full flex-col items-start gap-0.5 px-2.5 py-1.5 text-start font-mono text-[11px] text-foreground hover:bg-muted/60"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handlePick(c.prompt)}
            >
              <span className="text-electric-mint">{c.label}</span>
              <span className="text-muted-foreground text-[10px] font-sans font-normal">
                {c.prompt.slice(0, 72)}
                {c.prompt.length > 72 ? "…" : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
