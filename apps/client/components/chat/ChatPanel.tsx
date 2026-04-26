"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Thread } from "@/components/assistant-ui/thread";
import { cn } from "@/lib/utils";
import { Button } from "@darkflow/ui/button";

type ChatPanelProps = {
  className?: string;
  /** Hub layout: no card chrome, chat is the app surface */
  hub?: boolean;
  onClose?: () => void;
};

export const ChatPanel = ({ className, hub, onClose }: ChatPanelProps) => {
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
        <div className="flex items-center justify-between gap-2 border-border-subtle border-b px-3 py-1.5">
          <p className="font-medium text-muted-foreground text-[11px] uppercase tracking-[0.18em]">
            Command console
          </p>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-6 rounded-sm text-muted-foreground hover:text-foreground"
              aria-label="Close AI chat"
              onClick={onClose}
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center justify-end border-border-subtle border-b px-2 py-1">
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-6 rounded-sm text-muted-foreground hover:text-foreground"
              aria-label="Close AI chat"
              onClick={onClose}
            >
              <X className="size-3.5" />
            </Button>
          ) : (
            <div className="h-px w-full bg-border-subtle" aria-hidden />
          )}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Thread />
      </div>
    </motion.div>
  );
};
