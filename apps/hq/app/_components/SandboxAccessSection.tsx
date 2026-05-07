"use client";

import { FormEvent, useState } from "react";

const SandboxAccessSection = () => {
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim()) {
      setStatusMessage("ACCESS REQUEST REJECTED // USER_ACCESS_KEY REQUIRED.");
      return;
    }

    setStatusMessage("CONSOLE INITIALIZED // CLEARANCE REVIEW QUEUED.");
    setEmail("");
  };

  return (
    <section
      id="clearance"
      className="border-b border-white/10 px-6 py-14"
      aria-labelledby="clearance-heading"
    >
      <div className="mx-auto max-w-6xl">
        <p className="hq-lab-label text-center">clearance protocol</p>
        <h2
          id="clearance-heading"
          className="mt-2 text-center font-mono text-2xl tracking-[0.08em] text-foreground uppercase sm:text-3xl"
        >
          request sandbox access // phase 1 initialization
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center font-mono text-xs text-foreground/70">
          access to Darkflow runtime surfaces is restricted. we are currently
          onboarding a limited cohort of operators to validate phase 1 execution
          models.
        </p>

        <form
          className="hq-lab-panel mx-auto mt-8 max-w-2xl p-4 sm:p-5"
          onSubmit={handleSubmit}
        >
          <label htmlFor="user-access-key" className="hq-lab-label block">
            user_access_key
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="user-access-key"
              name="user-access-key"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="enter email address_"
              className="hq-lab-frame min-h-11 flex-1 bg-transparent px-3 py-2 font-mono text-sm text-foreground placeholder:text-foreground/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="User access key email"
              required
            />
            <button
              type="submit"
              className="min-h-11 border border-primary/60 bg-primary/10 px-4 py-2 font-mono text-xs tracking-[0.14em] text-primary uppercase transition-colors hover:bg-primary/18 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              initialize console
            </button>
          </div>
          <p className="mt-3 font-mono text-[11px] text-foreground/60">
            submissions are triaged against infrastructure fit, method alignment, and
            experimental safety constraints.
          </p>
          {statusMessage ? (
            <p className="mt-2 font-mono text-[11px] text-primary" aria-live="polite">
              {statusMessage}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
};

export { SandboxAccessSection };
