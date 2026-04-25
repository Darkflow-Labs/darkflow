"use client";

import { cn } from "@/lib/utils";

type DeskCenterProps = {
  className?: string;
};

/**
 * Middle column behind the hub chat shell: no duplicate of Thread welcome / composer
 * (those live only in {@link ChatPanel}). Keeps grid rhythm and a subtle lane texture.
 */
export const DeskCenter = ({ className }: DeskCenterProps) => {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 bg-black/25",
        "bg-[repeating-linear-gradient(-12deg,transparent,transparent_5px,rgba(255,255,255,0.02)_5px,rgba(255,255,255,0.02)_6px)]",
        className,
      )}
      aria-hidden
    />
  );
};
