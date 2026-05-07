import type { PublicSiteUrls } from "@/lib/siteUrls";

type ProjectsSectionProps = {
  urls: PublicSiteUrls;
};

type ResearchDirection = {
  code: string;
  title: string;
  stage: string;
  objective: string;
  artifacts: string;
};

const directions: ResearchDirection[] = [
  {
    code: "DF-01",
    title: "Meme Coin Ingestion Stream",
    stage: "phase 1 // completed",
    objective:
      "Built the first live stream focused on the Pump.fun token program to establish a reliable ingestion baseline for new launches.",
    artifacts: "pumpfun_stream_uptime_logs // launch_feed_snapshots",
  },
  {
    code: "DF-02",
    title: "Coin Quality Detection",
    stage: "phase 2 // completed",
    objective:
      "Added quality scoring to filter low-signal launches and rank higher-quality opportunities early.",
    artifacts: "quality_score_models // risk_filter_reports",
  },
  {
    code: "DF-03",
    title: "Trade Placement and Validator Buildout",
    stage: "phase 3 // completed",
    objective:
      "Implemented trade placement flows and began building validator-side infrastructure to improve execution reliability.",
    artifacts: "execution_traces // validator_build_notes",
  },
  {
    code: "DF-04",
    title: "Cross-Crypto Price Ingestion",
    stage: "phase 4 // current",
    objective:
      "Expanding ingestion from Solana-only coverage toward full multi-chain crypto price ingestion.",
    artifacts: "source_expansion_logs // chain_coverage_reports",
  },
  {
    code: "DF-05",
    title: "Any-Asset Trade Placement",
    stage: "phase 5 // upcoming",
    objective:
      "Generalizing trade placement so operators can execute across any supported crypto asset type.",
    artifacts: "execution_planning_docs // routing_design_specs",
  },
];

const ProjectsSection = ({ urls }: ProjectsSectionProps) => {
  return (
    <section
      id="research"
      className="border-b border-white/10 px-6 py-14"
      aria-labelledby="research-heading"
    >
      <div className="mx-auto max-w-6xl">
        <p className="hq-lab-label text-center">research index</p>
        <h2 id="research-heading" className="mt-2 text-center font-mono text-2xl tracking-[0.08em] text-foreground uppercase sm:text-3xl">
          active research directions
        </h2>
        <p className="mx-auto mt-3 max-w-3xl text-center font-mono text-xs text-foreground/70">
          current initiatives are framed as measurable programs with explicit phase state and
          reproducible evidence artifacts.
        </p>

        <div className="mt-10 space-y-3">
          {directions.map((direction) => (
            <article key={direction.code} className="hq-lab-panel p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
                <h3 className="font-mono text-base tracking-[0.08em] text-foreground uppercase">
                  [{direction.code}] {direction.title}
                </h3>
                <p className="font-mono text-[10px] tracking-widest text-foreground/65 uppercase">
                  {direction.stage}
                </p>
              </div>
              <p className="mt-3 font-sans text-sm leading-relaxed text-foreground/82">{direction.objective}</p>
              <p className="mt-3 font-mono text-[11px] text-foreground/65">
                artifacts: {direction.artifacts}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href={urls.console}
            className="hq-lab-frame px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-primary uppercase hover:text-primary/80"
            target="_blank"
            rel="noopener noreferrer"
          >
            inspect runtime surface
          </a>
          {urls.onyxDocs ? (
            <a
              href={urls.onyxDocs}
              className="hq-lab-frame px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-foreground/80 uppercase hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              read onyx research docs
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export { ProjectsSection };
