"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DeskCenter } from "@/components/layout/DeskCenter";
import { ContextDock } from "@/components/context/ContextDock";
import { SignalsColumn } from "@/components/signals/SignalsColumn";
import { useTerminal } from "@/components/layout/TerminalState";
import { authClient } from "@darkflow/auth/client";
import { Avatar, AvatarFallback, AvatarImage } from "@darkflow/ui/avatar";
import { Badge } from "@darkflow/ui/badge";
import { Button } from "@darkflow/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@darkflow/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@darkflow/ui/tooltip";
import { fetchChart, fetchTrades } from "@/lib/api/queries";
import { queryKeys } from "@/lib/query-keys";

const bootContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.045, delayChildren: 0.04 },
  },
};

const bootItem = {
  hidden: { opacity: 0, y: 5 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 380, damping: 28 },
  },
};

export const MainLayout = () => {
  const router = useRouter();
  const { selectedSymbol, orderFlash } = useTerminal();
  const [signalsOpen, setSignalsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { data: session } = authClient.useSession();

  const { data: chartPoints = [] } = useQuery({
    queryKey: queryKeys.chart(selectedSymbol),
    queryFn: () => fetchChart(selectedSymbol),
    refetchInterval: 3500,
  });

  const { data: tapeTrades = [] } = useQuery({
    queryKey: queryKeys.trades,
    queryFn: fetchTrades,
    refetchInterval: 2000,
  });

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/sign-in");
        },
      },
    });
    setIsSigningOut(false);
  };

  const displayName = session?.user?.name?.trim() || "Trader";
  const emailHandle = session?.user?.email?.split("@")[0];
  const userLabel = emailHandle || displayName;
  const initials = userLabel
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <motion.header
        id="console-app-header"
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
            hub
          </Badge>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="hidden font-mono text-[8px] text-muted-foreground uppercase tracking-wider underline-offset-2 hover:underline sm:inline md:text-[9px]"
                  aria-label="About this build"
                >
                  sim
                </button>
              }
            />
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              Chat-first command hub — mock tape + intel, context dock, slash commands MVP.
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-sm border-border-subtle px-2 font-mono text-[10px] uppercase lg:hidden"
            onClick={() => setSignalsOpen(true)}
            aria-label="Open signals"
          >
            <Menu className="size-3.5" />
            Signals
          </Button>

          {session?.user ? (
            <div className="hidden items-center gap-2 rounded-sm border border-border-subtle bg-muted/30 px-2 py-1 lg:flex">
              <Avatar size="sm">
                <AvatarImage src={session.user.image ?? undefined} alt={displayName} />
                <AvatarFallback>{initials || "TR"}</AvatarFallback>
              </Avatar>
              <div className="flex max-w-28 flex-col">
                <p className="truncate font-mono text-[10px] text-foreground uppercase">{displayName}</p>
                <p className="truncate text-[10px] text-muted-foreground">{session.user.email}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7"
                onClick={handleSignOut}
                disabled={isSigningOut}
                aria-label="Sign out"
              >
                <LogOut className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </div>
      </motion.header>

      <AnimatePresence mode="wait">
        {orderFlash ? (
          <motion.div
            key={orderFlash}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="shrink-0 border-border-subtle border-b bg-primary/10 px-2 py-1 font-mono text-primary text-xs"
            role="status"
          >
            {orderFlash}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,15rem)_1fr_minmax(0,20rem)]"
        variants={bootContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={bootItem} className="hidden min-h-0 min-w-0 lg:flex">
          <SignalsColumn className="h-full min-h-0 w-full" />
        </motion.div>

        <motion.div
          variants={bootItem}
          className="relative z-0 flex min-h-0 min-w-0 flex-col border-border-subtle lg:border-x"
        >
          <DeskCenter className="h-full min-h-0" />
        </motion.div>

        <motion.div variants={bootItem} className="hidden min-h-0 min-w-0 lg:flex">
          <ContextDock
            chartPoints={chartPoints}
            tapeTrades={tapeTrades}
            className="h-full min-h-0 w-full"
          />
        </motion.div>
      </motion.div>

      <Dialog open={signalsOpen} onOpenChange={setSignalsOpen}>
        <DialogContent className="max-h-[85dvh] max-w-md gap-0 overflow-hidden rounded-sm p-0 sm:max-w-md">
          <DialogHeader className="border-border-subtle border-b px-3 py-2">
            <DialogTitle className="font-mono text-xs uppercase tracking-wider">
              Signals
            </DialogTitle>
          </DialogHeader>
          <div className="h-[min(70dvh,520px)] min-h-0">
            <SignalsColumn className="h-full border-0 border-e-0" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
