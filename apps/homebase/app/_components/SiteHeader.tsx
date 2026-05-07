import Link from "next/link";

import { buttonVariants } from "@darkflow/ui/button-variants";
import { cn } from "@darkflow/ui/utils";

const SiteHeader = () => {
  return (
    <header className="border-b border-border/60 px-6 py-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link
          href="/"
          className="font-heading text-base font-semibold tracking-tight text-foreground"
        >
          darkflow
        </Link>
        <nav
          className="flex items-center gap-1 sm:gap-2"
          aria-label="Primary navigation"
        >
          <Link
            href="#console"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "font-mono text-[10px] uppercase tracking-wide sm:text-xs"
            )}
          >
            CONSOLE
          </Link>
          <Link
            href="#waitlist"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "font-mono text-[10px] uppercase tracking-wide sm:text-xs"
            )}
          >
            WAITLIST
          </Link>
          <Link
            href="#waitlist"
            className={cn(
              buttonVariants({ size: "sm" }),
              "font-mono text-[10px] uppercase tracking-wide sm:text-xs"
            )}
          >
            REQUEST_ACCESS
          </Link>
        </nav>
      </div>
    </header>
  );
};

export { SiteHeader };
