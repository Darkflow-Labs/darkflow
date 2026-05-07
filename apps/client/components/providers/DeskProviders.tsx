"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AutumnProvider } from "autumn-js/react";
import { DarkflowAssistantRoot } from "@/components/chat/DarkflowAssistantRoot";
import { DeskShell } from "@/components/layout/DeskShell";
import { TerminalStateProvider } from "@/components/layout/TerminalState";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ZeroSyncProvider } from "@/components/providers/ZeroSyncProvider";

type DeskProvidersProps = {
  children: ReactNode;
};

export const DeskProviders = ({ children }: DeskProvidersProps) => {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/sign-in");

  if (isAuthRoute) {
    return (
      <AutumnProvider>
        <QueryProvider>{children}</QueryProvider>
      </AutumnProvider>
    );
  }

  return (
    <AutumnProvider>
      <QueryProvider>
        <ZeroSyncProvider>
          <TerminalStateProvider>
            <DarkflowAssistantRoot>
              <DeskShell>{children}</DeskShell>
            </DarkflowAssistantRoot>
          </TerminalStateProvider>
        </ZeroSyncProvider>
      </QueryProvider>
    </AutumnProvider>
  );
};
