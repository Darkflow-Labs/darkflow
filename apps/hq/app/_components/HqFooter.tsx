const HqFooter = () => {
  return (
    <footer className="mt-auto px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <p className="font-mono text-xs tracking-[0.12em] text-foreground/70 uppercase">
          darkflow labs registry // publish the method, not the outcome.
        </p>
        <div className="hq-lab-frame flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="font-mono text-[11px] text-foreground/70">
            PUBLICATION CADENCE: WEEKLY RESEARCH LOGS // QUARTERLY METHOD REPORTS
          </p>
          <p className="font-mono text-[11px] text-foreground/55">
            © {new Date().getFullYear()} DARKFLOW. ALL RIGHTS RESERVED. [STATUS: ACTIVE]
          </p>
        </div>
      </div>
    </footer>
  );
};

export { HqFooter };
