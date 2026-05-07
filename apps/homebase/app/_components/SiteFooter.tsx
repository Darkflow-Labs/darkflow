const SiteFooter = () => {
  return (
    <footer className="mt-auto border-t border-border/60 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <p className="font-mono text-xs text-muted-foreground">
          Darkflow · Step into the flow. One console, full context.
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          Early access · limited cohort · invites ship in waves
        </p>
        <div className="border-t border-border/40 pt-6 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Darkflow. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export { SiteFooter };
