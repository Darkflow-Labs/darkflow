"use client";

import { motion } from "framer-motion";
import { Thread } from "@/components/assistant-ui/thread";
import { cn } from "@/lib/utils";

type ChatPanelProps = {
  className?: string;
  /** Hub layout: no card chrome, chat is the app surface */
  hub?: boolean;
};

export const ChatPanel = ({ className, hub }: ChatPanelProps) => {
  return (
    <motion.div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        !hub &&
          "rounded-lg border border-border-subtle bg-surface-glass/90 backdrop-blur-sm",
        hub && "bg-transparent",
        className,
      )}
    >
      {!hub ? (
        <div className="border-border-subtle border-b px-3 py-1.5">
          <p className="font-medium text-muted-foreground text-[11px] uppercase tracking-[0.18em]">
            Command console
          </p>
        </div>
      ) : (
        <div className="h-px shrink-0 bg-border-subtle" aria-hidden />
      )}
      <div className="min-h-0 flex-1">
        <Thread />
      </div>
    </motion.div>
  );
};
