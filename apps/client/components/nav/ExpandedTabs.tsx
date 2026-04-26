"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export type TabItem =
  | { title: string; icon: LucideIcon; url: string }
  | { type: "separator" };

type ExpandedTabsProps = {
  tabs: TabItem[];
  className?: string;
  activeClassName?: string;
};

const buttonVariants = {
  initial: {
    gap: 0,
    paddingLeft: ".5rem",
    paddingRight: ".5rem",
  },
  animate: (isSelected: boolean) => ({
    gap: isSelected ? ".5rem" : 0,
    paddingLeft: isSelected ? "1rem" : ".5rem",
    paddingRight: isSelected ? "1rem" : ".5rem",
  }),
};

const spanVariants = {
  initial: { width: 0, opacity: 0 },
  animate: { width: "auto", opacity: 1 },
  exit: { width: 0, opacity: 0 },
};

const transition = { delay: 0.1, type: "spring" as const, bounce: 0, duration: 0.6 };

export const ExpandedTabs = ({
  tabs,
  className,
  activeClassName = "text-primary",
}: ExpandedTabsProps) => {
  const router = useRouter();
  const pathname = usePathname();

  const activeIndex = tabs.findIndex(
    (tab) => "url" in tab && tab.url === pathname,
  );

  const handleSelect = (index: number) => {
    const tab = tabs[index];
    if (!tab || !("url" in tab)) return;
    if (tab.url === pathname) return;
    window.setTimeout(() => {
      router.push(tab.url);
    }, 200);
  };

  const Separator = () => (
    <div className="h-9 w-px shrink-0 bg-border-subtle" aria-hidden />
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.12 }}
      className={cn(
        "flex gap-1 rounded-2xl border border-border-subtle bg-background/95 p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.85)] backdrop-blur-md",
        className,
      )}
    >
      {tabs.map((tab, index) => {
        if (!("url" in tab)) {
          return <Separator key={`sep-${index}`} />;
        }

        const Icon = tab.icon;
        const isActive = index === activeIndex;

        return (
          <motion.button
            key={tab.title}
            type="button"
            variants={buttonVariants}
            initial={false}
            animate="animate"
            custom={isActive}
            transition={transition}
            onClick={() => handleSelect(index)}
            className={cn(
              "relative flex items-center rounded-xl px-2 py-2 font-medium text-sm transition-colors duration-300",
              isActive
                ? cn("bg-white/[0.06]", activeClassName)
                : "cursor-pointer text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
            aria-label={tab.title}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            <AnimatePresence initial={false}>
              {isActive ? (
                <motion.span
                  variants={spanVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap ps-1"
                >
                  {tab.title}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </motion.div>
  );
};
