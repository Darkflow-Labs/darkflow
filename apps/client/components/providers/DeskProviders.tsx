"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DarkflowAssistantRoot } from "@/components/chat/DarkflowAssistantRoot";
import { DeskShell } from "@/components/layout/DeskShell";
import { TerminalStateProvider } from "@/components/layout/TerminalState";
import { QueryProvider } from "@/components/providers/QueryProvider";

type DeskProvidersProps = {
  children: ReactNode;
};

export const DeskProviders = ({ children }: DeskProvidersProps) => {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/sign-in");

  if (isAuthRoute) {
    return <QueryProvider>{children}</QueryProvider>;
  }

  return (
    <QueryProvider>
      <TerminalStateProvider>
        <DarkflowAssistantRoot>
          <DeskShell>{children}</DeskShell>
        </DarkflowAssistantRoot>
      </TerminalStateProvider>
    </QueryProvider>
  );
};
