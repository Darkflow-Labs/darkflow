"use client";

import { motion } from "framer-motion";
import { ReconBoard } from "@/components/recon/ReconBoard";
import { Badge } from "@darkflow/ui/badge";

export default function ReconPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <motion.header
        id="desk-app-header"
        initial={{ opacity: 0, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className="shrink-0 flex items-center justify-between gap-2 border-border-subtle border-b px-2 py-1 md:px-2.5"
      >
        <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
          <h1 className="font-semibold text-foreground text-xs tracking-tight md:text-sm">
            darkflow.
          </h1>
          <Badge
            variant="outline"
            className="rounded-sm border-border-subtle px-1 py-0 font-mono text-[8px] text-muted-foreground uppercase leading-none md:text-[9px]"
          >
            recon
          </Badge>
        </div>
      </motion.header>
      <ReconBoard />
    </div>
  );
}
