"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MockTrade } from "@/lib/data/mockData";

type TerminalStateValue = {
  selectedSymbol: string;
  setSelectedSymbol: (s: string) => void;
  appendSimulatedTrade: (t: MockTrade) => void;
  trades: MockTrade[];
  orderFlash: string | null;
  clearOrderFlash: () => void;
  flashOrder: (msg: string) => void;
  chartDrawerOpen: boolean;
  setChartDrawerOpen: (open: boolean) => void;
  coinInsightsOpen: boolean;
  coinInsightsLabel: string | null;
  coinInsightsWide: boolean;
  setCoinInsightsWide: (wide: boolean) => void;
  openCoinInsights: (symbol: string, label?: string | null) => void;
  closeCoinInsights: () => void;
};

const TerminalStateContext = createContext<TerminalStateValue | null>(null);

export const TerminalStateProvider = ({ children }: { children: ReactNode }) => {
  const [selectedSymbol, setSelectedSymbol] = useState("SOL");
  const [trades, setTrades] = useState<MockTrade[]>([]);
  const [orderFlash, setOrderFlash] = useState<string | null>(null);
  const [chartDrawerOpen, setChartDrawerOpen] = useState(false);
  const [coinInsightsOpen, setCoinInsightsOpen] = useState(false);
  const [coinInsightsLabel, setCoinInsightsLabel] = useState<string | null>(null);
  const [coinInsightsWide, setCoinInsightsWide] = useState(false);

  const appendSimulatedTrade = useCallback((t: MockTrade) => {
    setTrades((prev) => [t, ...prev].slice(0, 80));
  }, []);

  const clearOrderFlash = useCallback(() => setOrderFlash(null), []);

  const flashOrder = useCallback((msg: string) => {
    setOrderFlash(msg);
    window.setTimeout(() => setOrderFlash(null), 3200);
  }, []);

  const openCoinInsights = useCallback((symbol: string, label?: string | null) => {
    const next = symbol.trim().toUpperCase();
    if (!next) return;
    setSelectedSymbol(next);
    setCoinInsightsLabel(label ?? null);
    setCoinInsightsWide(false);
    setCoinInsightsOpen(true);
  }, []);

  const closeCoinInsights = useCallback(() => {
    setCoinInsightsOpen(false);
    setCoinInsightsLabel(null);
    setCoinInsightsWide(false);
  }, []);

  const value = useMemo(
    () => ({
      selectedSymbol,
      setSelectedSymbol,
      appendSimulatedTrade,
      trades,
      orderFlash,
      clearOrderFlash,
      flashOrder,
      chartDrawerOpen,
      setChartDrawerOpen,
      coinInsightsOpen,
      coinInsightsLabel,
      coinInsightsWide,
      setCoinInsightsWide,
      openCoinInsights,
      closeCoinInsights,
    }),
    [
      selectedSymbol,
      setSelectedSymbol,
      appendSimulatedTrade,
      trades,
      orderFlash,
      clearOrderFlash,
      flashOrder,
      chartDrawerOpen,
      setChartDrawerOpen,
      coinInsightsOpen,
      coinInsightsLabel,
      coinInsightsWide,
      openCoinInsights,
      closeCoinInsights,
    ],
  );

  return (
    <TerminalStateContext.Provider value={value}>
      {children}
    </TerminalStateContext.Provider>
  );
};

export const useTerminal = () => {
  const ctx = useContext(TerminalStateContext);
  if (!ctx) {
    throw new Error("useTerminal must be used within TerminalStateProvider");
  }
  return ctx;
};
