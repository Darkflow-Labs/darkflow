const SiteFooter = () => {
  return (
    <footer className="mt-auto border-t border-border/60 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <p className="font-mono text-xs text-muted-foreground">
          Darkflow · Step into the flow. One desk, full context.
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          Early access · limited cohort · invites ship in waves
        </p>
        <div className="flex flex-col justify-between gap-4 border-t border-border/40 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Darkflow. All rights reserved.</p>
          <div className="flex flex-wrap gap-4">
            <span className="text-muted-foreground/80">Privacy (placeholder)</span>
            <span className="text-muted-foreground/80">Terms (placeholder)</span>
            <span className="text-muted-foreground/80">Security disclosure (placeholder)</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export { SiteFooter };
