"use client";

import { useEffect, useMemo, useState } from "react";

type LogStatus = "active" | "pass" | "degraded";
type TerminalLog = {
  id: string;
  status: LogStatus;
  text: string;
};

const LOG_SEQUENCE: TerminalLog[] = [
  {
    id: "log-01",
    status: "active",
    text: "LAB_NODE_09: sensing blockhash congestion (solana/mainnet).",
  },
  {
    id: "log-02",
    status: "active",
    text: "RECON_AGENT_04: profiling emergent pools and deployer wallet clusters.",
  },
  {
    id: "log-03",
    status: "pass",
    text: "SIM_ENGINE: 10,000 intent mutations completed; median settlement 9.2ms.",
  },
  {
    id: "log-04",
    status: "degraded",
    text: "SOURCE_HEALTH: drpc stream jitter rising to 18ms (threshold 15ms).",
  },
  {
    id: "log-05",
    status: "active",
    text: "RISK_CTRL: defensive gate raised for low-depth venues.",
  },
  {
    id: "log-06",
    status: "pass",
    text: "SIGNER_SERVICE: quorum attestation stable; signing latency 3.1ms.",
  },
];

const ResearchConsoleMotion = () => {
  const [cursor, setCursor] = useState(3);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCursor((current) => (current + 1 > LOG_SEQUENCE.length ? 3 : current + 1));
    }, 2400);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const visibleLogs = useMemo(
    () => LOG_SEQUENCE.slice(0, cursor),
    [cursor],
  );

  const statusTone: Record<LogStatus, string> = {
    active: "text-primary",
    pass: "text-foreground",
    degraded: "text-amber-300",
  };

  return (
    <section className="hq-lab-panel p-4 sm:p-5" role="region" aria-label="Live terminal console">
      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
        <div>
          <p className="hq-lab-label">live execution console</p>
          <p className="mt-1 font-mono text-[10px] text-foreground/60">
            protocol ingestion // autonomous recon // latency telemetry
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hq-status-dot" aria-hidden="true" />
          <span className="font-mono text-[10px] tracking-[0.12em] text-primary uppercase">
            active
          </span>
        </div>
      </div>

      <div className="hq-lab-frame h-[310px] overflow-hidden p-3 sm:h-[340px]">
        <div className="h-full overflow-y-auto pr-2" aria-live="polite">
          {visibleLogs.map((line, index) => (
            <div key={line.id} className="mb-2 grid grid-cols-[88px_64px_1fr] items-start gap-2 font-mono text-[11px]">
              <span className="text-foreground/55">
                [{new Date(Date.now() - (visibleLogs.length - index) * 1000).toUTCString().slice(17, 25)}]
              </span>
              <span className={statusTone[line.status]}>{line.status.toUpperCase()}</span>
              <span className="text-foreground/85">{line.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics block disabled until live telemetry is available.
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="hq-lab-frame p-3">
          <p className="font-mono text-[11px] tracking-[0.2em] text-foreground/75 uppercase">
            median block transit
            <span className="block">time</span>
          </p>
          <p className="mt-4 font-mono text-4xl text-primary">--</p>
        </div>
        <div className="hq-lab-frame p-3">
          <p className="font-mono text-[11px] tracking-[0.2em] text-foreground/75 uppercase">
            active
            <span className="block">reconnaissance</span>
            <span className="block">sensors</span>
          </p>
          <p className="mt-4 font-mono text-4xl text-foreground">--</p>
        </div>
        <div className="hq-lab-frame p-3">
          <p className="font-mono text-[11px] tracking-[0.2em] text-foreground/75 uppercase">
            validated
            <span className="block">correlation ratio</span>
          </p>
          <p className="mt-4 font-mono text-4xl text-foreground">--</p>
        </div>
      </div>
      */}
    </section>
  );
};

export { ResearchConsoleMotion };
