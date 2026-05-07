import Link from "next/link";

import type { PublicSiteUrls } from "@/lib/siteUrls";

type HqHeaderProps = {
  urls: PublicSiteUrls;
};

const HqHeader = ({ urls }: HqHeaderProps) => {
  return (
    <header className="border-b border-white/10 px-6 py-4">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <Link
          href="/"
          className="font-mono text-sm tracking-[0.22em] text-foreground uppercase"
        >
          darkflow labs hq
        </Link>
        <nav
          className="flex flex-wrap items-center justify-end gap-2"
          aria-label="Primary navigation"
        >
          <Link
            href="#research"
            className="hq-lab-frame px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-foreground/80 uppercase transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Research Index
          </Link>
          <Link
            href="#telemetry"
            className="hq-lab-frame px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-foreground/80 uppercase transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Telemetry
          </Link>
          <Link
            href="#clearance"
            className="hq-lab-frame px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-foreground/80 uppercase transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Clearance
          </Link>
          {urls.githubOrg ? (
            <a
              href={urls.githubOrg}
              className="hq-lab-frame px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-primary uppercase transition-colors hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Artifact Registry
            </a>
          ) : null}
        </nav>
      </div>
    </header>
  );
};

export { HqHeader };
