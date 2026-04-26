"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MockTrade } from "@/lib/data/mockData";

const PINNED_TOKENS_STORAGE_KEY = "df:pinned-tokens";

export type PinnedToken = {
  symbol: string;
  label: string | null;
};

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
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  pinnedTokens: PinnedToken[];
  pinToken: (token: PinnedToken) => void;
  unpinToken: (symbol: string) => void;
  isTokenPinned: (symbol: string) => boolean;
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
  const [chatOpen, setChatOpen] = useState(true);
  const [pinnedTokens, setPinnedTokens] = useState<PinnedToken[]>([]);

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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PINNED_TOKENS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PinnedToken[];
      if (!Array.isArray(parsed)) return;
      const normalized = parsed
        .map((row) => ({
          symbol: String(row.symbol ?? "").trim().toUpperCase(),
          label: row.label ? String(row.label) : null,
        }))
        .filter((row) => row.symbol.length > 0);
      setPinnedTokens(normalized.slice(0, 10));
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PINNED_TOKENS_STORAGE_KEY, JSON.stringify(pinnedTokens));
  }, [pinnedTokens]);

  const pinToken = useCallback((token: PinnedToken) => {
    const nextSymbol = token.symbol.trim().toUpperCase();
    if (!nextSymbol) return;
    setPinnedTokens((prev) => {
      const next = [{ symbol: nextSymbol, label: token.label ?? null }, ...prev.filter((row) => row.symbol !== nextSymbol)];
      return next.slice(0, 10);
    });
  }, []);

  const unpinToken = useCallback((symbol: string) => {
    const nextSymbol = symbol.trim().toUpperCase();
    if (!nextSymbol) return;
    setPinnedTokens((prev) => prev.filter((row) => row.symbol !== nextSymbol));
  }, []);

  const isTokenPinned = useCallback(
    (symbol: string) => {
      const nextSymbol = symbol.trim().toUpperCase();
      return pinnedTokens.some((row) => row.symbol === nextSymbol);
    },
    [pinnedTokens],
  );

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
      chatOpen,
      setChatOpen,
      pinnedTokens,
      pinToken,
      unpinToken,
      isTokenPinned,
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
      chatOpen,
      setChatOpen,
      pinnedTokens,
      pinToken,
      unpinToken,
      isTokenPinned,
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
