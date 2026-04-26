"use client";

import { Shield, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "./button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { cn } from "./utils";

type AuthSignInScreenProps = {
  onDiscordSignIn: () => void | Promise<void>;
  isLoading?: boolean;
  errorMessage?: string | null;
  className?: string;
};

const valuePoints = [
  {
    title: "Everything in one place",
    description: "See your market data, portfolio, and tools together in one workspace.",
    icon: TrendingUp,
  },
  {
    title: "Clear decision support",
    description: "Use insights and charts that are easy to read so you can act with confidence.",
    icon: Sparkles,
  },
  {
    title: "Simple, secure sign-in",
    description: "Sign in quickly with one social account. No password management needed.",
    icon: Shield,
  },
];

export const AuthSignInScreen = ({
  onDiscordSignIn,
  isLoading = false,
  errorMessage,
  className,
}: AuthSignInScreenProps) => {
  return (
    <section
      className={cn(
        "relative mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-8 md:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10 lg:py-12",
        className,
      )}
      aria-label="Darkflow sign in"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_15%,rgba(125,211,252,0.12),transparent_35%),radial-gradient(circle_at_85%_75%,rgba(168,85,247,0.14),transparent_40%)]" />

      <div className="flex flex-col justify-center gap-6">
        <div className="space-y-3">
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
            darkflow // crypto terminal
          </p>
          <h1 className="max-w-xl font-semibold text-3xl text-foreground tracking-tight md:text-5xl">
            Trade faster with darkflow.
          </h1>
          <p className="max-w-xl text-base text-muted-foreground md:text-lg">
            Sign in to access your market workspace, portfolio analytics, and real-time intel streams.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {valuePoints.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-xl border border-border-subtle bg-card/60 p-3 backdrop-blur-sm"
            >
              <Icon className="mb-2 size-4 text-primary" aria-hidden />
              <p className="font-medium text-sm text-foreground">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>

      <Card className="border border-border-subtle bg-card/80 backdrop-blur-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="font-semibold text-xl">Sign in with Discord</CardTitle>
          <CardDescription>
            Use your Discord account to securely access your Darkflow workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            variant="default"
            size="lg"
            className="w-full justify-center bg-gradient-to-r from-[#5865F2] to-[#4752C4] font-medium text-white shadow-[0_0_24px_rgba(88,101,242,0.45)] transition-all hover:from-[#6974F3] hover:to-[#5865F2] hover:shadow-[0_0_36px_rgba(88,101,242,0.6)] focus-visible:ring-[#5865F2]"
            disabled={isLoading}
            onClick={onDiscordSignIn}
            aria-label="Continue with Discord"
          >
            {isLoading ? "Connecting to Discord..." : "Continue with Discord"}
          </Button>
          <p className="text-xs text-muted-foreground">
            By continuing, you agree to use Discord as the sign-in method for this account.
          </p>
          <p className="text-xs text-muted-foreground">
            Join our Discord community to share ideas, get support, and stay updated on new features.
          </p>
          {errorMessage ? (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
};
