"use client";

import { motion } from "framer-motion";

import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const LabsHero = () => {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <section
      className="border-b border-white/10 px-6 pb-10 pt-14 sm:pb-14 sm:pt-18"
      aria-labelledby="hq-hero-heading"
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          className="flex flex-col gap-6 text-left"
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="font-mono text-[10px] tracking-[0.2em] text-foreground/70 uppercase sm:text-xs">
            darkflow labs hq // protocol research and intent-driven latency
          </p>
          <h1
            id="hq-hero-heading"
            className="text-balance font-mono text-3xl leading-[1.1] tracking-[0.06em] text-foreground uppercase sm:text-4xl md:text-[46px]"
          >
            Faster execution. Less manual friction.
          </h1>
          <div className="hq-lab-frame max-w-xl p-4">
            <p className="font-mono text-[10px] tracking-widest text-foreground/70 uppercase">
              thesis
            </p>
            <p className="mt-3 font-sans text-sm leading-relaxed text-foreground/80">
              We build systems that eliminate manual friction, neutralizing RPC
              congestion and front-running via agentic execution.
            </p>
          </div>
          <ul className="grid max-w-xl grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <li className="hq-lab-frame p-3">
              <p className="hq-lab-label">Division</p>
              <p className="mt-2 font-mono text-foreground">Protocol Dynamics</p>
            </li>
            <li className="hq-lab-frame p-3">
              <p className="hq-lab-label">Cycle</p>
              <p className="mt-2 font-mono text-foreground">24/7 Ingestion</p>
            </li>
            <li className="hq-lab-frame p-3">
              <p className="hq-lab-label">Doctrine</p>
              <p className="mt-2 font-mono text-foreground">Evidence over Narrative</p>
            </li>
          </ul>
        </motion.div>
        {/* Hero console disabled until live runtime data is available.
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          <ResearchConsoleMotion />
        </motion.div>
        */}
      </div>
    </section>
  );
};

export { LabsHero };
