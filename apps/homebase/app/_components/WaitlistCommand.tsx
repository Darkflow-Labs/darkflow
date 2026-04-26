"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@darkflow/ui/button";
import { buttonVariants } from "@darkflow/ui/button-variants";
import { Input } from "@darkflow/ui/input";
import { cn } from "@darkflow/ui/utils";

const STORAGE_KEY = "homebase_terminal_id";
const STORAGE_EMAIL = "homebase_waitlist_email";

/**
 * Wire this form to your API, e.g. POST /api/waitlist with JSON { credential }.
 * Return { terminalId } from the server for a stable ID, or persist in your DB.
 */
const hashCredentialToTerminalId = async (value: string): Promise<string> => {
  const normalized = value.trim().toLowerCase();
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest).slice(0, 4);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `USER-${hex}-BETA`;
};

const buildShareText = (siteUrl: string) =>
  `Getting on the list for Darkflow — conversational trading desk + AI copilot. Join me: ${siteUrl}`;

const WaitlistCommand = () => {
  const fieldId = useId();
  const [credential, setCredential] = useState("");
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  useEffect(() => {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    const stored = sessionStorage.getItem(STORAGE_KEY);
    const storedCred = sessionStorage.getItem(STORAGE_EMAIL);
    if (stored) {
      setTerminalId(stored);
    }
    if (storedCred) {
      setCredential(storedCred);
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!credential.trim()) {
        return;
      }
      setBusy(true);
      try {
        const id = await hashCredentialToTerminalId(credential);
        setTerminalId(id);
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(STORAGE_KEY, id);
          sessionStorage.setItem(STORAGE_EMAIL, credential.trim());
        }
      } finally {
        setBusy(false);
      }
    },
    [credential]
  );

  const shareHref =
    origin !== ""
      ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(buildShareText(origin))}`
      : "#";

  return (
    <div id="waitlist" className="mx-auto mt-8 max-w-4xl px-6 pb-6">
      <div className="hb-glass rounded-xl p-5 sm:p-6">
        <p className="mb-3 font-mono text-[10px] font-medium tracking-wide text-muted-foreground uppercase sm:text-[11px]">
          [DESK]: EARLY_ACCESS_WAITLIST
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          Reserve a seat for the chat-native trading hub—no wallet required to sign
          up, just something we can reach you at.
        </p>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label htmlFor={fieldId} className="font-mono text-xs text-muted-foreground">
              Your email (required)
            </label>
            <div className="flex min-h-10 items-center gap-2 border-b border-border/50 bg-transparent px-0 py-1 transition-colors focus-within:border-primary/50">
              <span
                className="shrink-0 font-mono text-sm text-primary"
                aria-hidden="true"
              >
                &gt;
              </span>
              <Input
                id={fieldId}
                name="credential"
                type="text"
                autoComplete="email"
                placeholder="your@email.com"
                value={credential}
                onChange={(e) => {
                  setCredential(e.target.value);
                }}
                className="h-9 flex-1 border-0 bg-transparent px-0 font-mono text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:text-sm"
                required
              />
              <span
                className="hb-cursor-blink font-mono text-sm text-primary"
                aria-hidden="true"
              >
                _
              </span>
            </div>
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="w-fit shrink-0 font-mono text-xs uppercase tracking-wide sm:text-sm"
          >
            {busy ? "SENDING…" : "REQUEST_EARLY_ACCESS"}
          </Button>
        </form>

        {terminalId !== null ? (
          <div className="mt-6 space-y-3 border-t border-border/60 pt-6">
            <p className="font-mono text-sm text-muted-foreground">
              You&apos;re on the list
            </p>
            <p className="font-mono text-lg font-medium tracking-tight text-foreground">
              {terminalId}
            </p>
            <p className="text-sm text-muted-foreground">
              Save this ID—we&apos;ll use it when invites go out. Nothing here is a
              live trading or performance claim; it&apos;s your waitlist receipt.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href={shareHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "font-mono text-xs uppercase"
                )}
              >
                Share on X
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export { WaitlistCommand };
