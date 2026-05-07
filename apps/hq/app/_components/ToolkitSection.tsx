import type { PublicSiteUrls } from "@/lib/siteUrls";

type ToolkitSectionProps = {
  urls: PublicSiteUrls;
};

const ToolkitSection = ({ urls }: ToolkitSectionProps) => {
  return (
    <section
      id="telemetry"
      className="border-b border-white/10 px-6 py-14"
      aria-labelledby="methods-heading"
    >
      <div className="mx-auto max-w-6xl">
        <p className="hq-lab-label text-center">methodology and empirical status</p>
        <h2 id="methods-heading" className="mt-2 text-center font-mono text-2xl tracking-[0.08em] text-foreground uppercase sm:text-3xl">
          telemetry board
        </h2>
        <p className="mx-auto mt-3 max-w-3xl text-center font-mono text-xs text-foreground/70">
          live metrics are temporarily offline. cards stay visible as placeholders
          until the telemetry pipeline is active.
        </p>

        {/* Metrics block disabled until live telemetry is available.
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {telemetryMetrics.map((metric) => (
            <article key={metric.label.join("-")} className="hq-lab-panel p-4 sm:p-5">
              <p className="font-mono text-[12px] tracking-[0.2em] text-foreground/75 uppercase">
                {metric.label.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
              <p
                className={`mt-6 font-mono text-5xl ${
                  metric.tone === "primary" ? "text-primary" : "text-foreground"
                }`}
              >
                {metric.value}
              </p>
            </article>
          ))}
        </div>
        */}

        <article className="hq-lab-panel mt-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <h3 className="font-mono text-sm tracking-[0.08em] text-foreground uppercase">
              instrumentation stack
            </h3>
            <p className="font-mono text-[10px] tracking-[0.14em] text-foreground/65 uppercase">
              operator-visible components
            </p>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="hq-lab-frame p-3">
              <p className="font-mono text-xs text-foreground">@darkflow/engine</p>
              <p className="mt-2 font-sans text-sm leading-relaxed text-foreground/78">
                execution substrate for venue adapters, transaction assembly, and policy
                enforcement under controlled replay conditions.
              </p>
            </div>
            <div className="hq-lab-frame p-3">
              <p className="font-mono text-xs text-foreground">@darkflow/sync</p>
              <p className="mt-2 font-sans text-sm leading-relaxed text-foreground/78">
                high-frequency state replication and stream writers that preserve coherent
                state transitions across observability surfaces.
              </p>
            </div>
            <div className="hq-lab-frame p-3">
              <p className="font-mono text-xs text-foreground">@darkflow/js</p>
              <p className="mt-2 font-sans text-sm leading-relaxed text-foreground/78">
                typed transport clients for HTTP and websocket ingestion to keep evidence
                capture portable across run environments.
              </p>
            </div>
            <div className="hq-lab-frame p-3">
              <p className="font-mono text-xs text-foreground">@darkflow/db · @darkflow/auth</p>
              <p className="mt-2 font-sans text-sm leading-relaxed text-foreground/78">
                baseline identity and persistence layers used to anchor repeatable
                experiment workflows and access policy boundaries.
              </p>
            </div>
          </div>
          {urls.githubOrg ? (
            <a
              href={urls.githubOrg}
              className="mt-4 inline-flex hq-lab-frame px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-primary uppercase hover:text-primary/80"
              target="_blank"
              rel="noopener noreferrer"
            >
              open artifact repository
            </a>
          ) : null}
        </article>
      </div>
    </section>
  );
};

export { ToolkitSection };
