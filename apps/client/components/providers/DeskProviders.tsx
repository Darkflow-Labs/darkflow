"use client";

import type { ReactNode } from "react";
import { DarkflowAssistantRoot } from "@/components/chat/DarkflowAssistantRoot";
import { DeskShell } from "@/components/layout/DeskShell";
import { TerminalStateProvider } from "@/components/layout/TerminalState";
import { QueryProvider } from "@/components/providers/QueryProvider";

type DeskProvidersProps = {
  children: ReactNode;
};

export const DeskProviders = ({ children }: DeskProvidersProps) => {
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
