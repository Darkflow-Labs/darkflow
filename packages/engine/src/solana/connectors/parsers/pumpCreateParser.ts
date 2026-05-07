import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";

/** Default pump.fun program (override via subscriber `programId`). */
export const PUMP_FUN_PROGRAM_ID_DEFAULT = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

const CREATE_EVENT_DISC = Uint8Array.from([27, 114, 169, 77, 222, 235, 99, 118]);
const CREATE_IX_DISC = Uint8Array.from([24, 30, 200, 40, 5, 28, 7, 119]);
const CREATE_V2_IX_DISC = Uint8Array.from([214, 144, 76, 236, 95, 139, 49, 180]);

export type ParsedPumpCreate = {
  tokenMint: string;
  creator: string;
  bondingCurve?: string;
  user?: string;
  name?: string;
  symbol?: string;
  uri?: string;
};

const discEq = (a: Uint8Array, b: Uint8Array) => {
  if (a.length < b.length) {
    return false;
  }
  for (let i = 0; i < b.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

const readU32Le = (buf: Buffer, offset: number): { value: number; next: number } => ({
  value: buf.readUInt32LE(offset),
  next: offset + 4
});

const readBorshString = (buf: Buffer, offset: number): { value: string; next: number } | null => {
  if (offset + 4 > buf.length) {
    return null;
  }
  const { value: len, next: afterLen } = readU32Le(buf, offset);
  if (len < 0 || len > 10_000 || afterLen + len > buf.length) {
    return null;
  }
  const value = buf.subarray(afterLen, afterLen + len).toString("utf8");
  return { value, next: afterLen + len };
};

const bytesToBase58 = (bytes: Uint8Array) => new PublicKey(Buffer.from(bytes)).toBase58();

/** Anchor `CreateEvent` payload after 8-byte discriminator (IDL `pump_fun_idl.json`). */
export const decodeCreateEventPayload = (buf: Buffer): ParsedPumpCreate | null => {
  if (buf.length < 8 + 12) {
    return null;
  }
  if (!discEq(buf.subarray(0, 8), CREATE_EVENT_DISC)) {
    return null;
  }
  let o = 8;
  const name = readBorshString(buf, o);
  if (!name) {
    return null;
  }
  o = name.next;
  const symbol = readBorshString(buf, o);
  if (!symbol) {
    return null;
  }
  o = symbol.next;
  const uri = readBorshString(buf, o);
  if (!uri) {
    return null;
  }
  o = uri.next;
  // Four pubkeys + i64 + 4×u64 + token_program pubkey + two bools (IDL `CreateEvent`).
  const fixedTail = 32 * 4 + 8 + 8 * 4 + 32 + 1 + 1;
  if (o + fixedTail > buf.length) {
    return null;
  }
  const mint = bytesToBase58(buf.subarray(o, o + 32));
  o += 32;
  const bondingCurve = bytesToBase58(buf.subarray(o, o + 32));
  o += 32;
  const user = bytesToBase58(buf.subarray(o, o + 32));
  o += 32;
  const creator = bytesToBase58(buf.subarray(o, o + 32));
  o += 32;
  return {
    tokenMint: mint,
    creator,
    bondingCurve,
    user,
    name: name.value,
    symbol: symbol.value,
    uri: uri.value
  };
};

const decodeProgramDataLine = (line: string): ParsedPumpCreate | null => {
  const marker = "Program data: ";
  const idx = line.indexOf(marker);
  if (idx === -1) {
    return null;
  }
  const b64 = line.slice(idx + marker.length).trim();
  if (!b64) {
    return null;
  }
  let raw: Buffer;
  try {
    raw = Buffer.from(b64, "base64");
  } catch {
    return null;
  }
  return decodeCreateEventPayload(raw);
};

/**
 * Pump.fun launch log filter: Create / Create_v2, excluding txs that open token accounts (swap noise).
 * Mirrors `apps/pumpfun-bonkfun-bot` `PumpFunEventParser.parse_token_creation_from_logs` pre-checks.
 */
export const looksLikePumpfunCreateLogs = (logs: string[]): boolean => {
  const hasCreate = logs.some(
    (line) =>
      line.includes("Program log: Instruction: Create") || line.includes("Program log: Instruction: Create_v2")
  );
  if (!hasCreate) {
    return false;
  }
  if (logs.some((line) => line.includes("Program log: Instruction: CreateTokenAccount"))) {
    return false;
  }
  return true;
};

/**
 * Prefer Anchor `Program data:` `CreateEvent` blobs (same order as reference Python parser).
 */
export const parsePumpCreateFromLogs = (logs: string[]): ParsedPumpCreate | null => {
  if (!looksLikePumpfunCreateLogs(logs)) {
    return null;
  }
  for (const line of logs) {
    if (!line.includes("Program data:")) {
      continue;
    }
    const parsed = decodeProgramDataLine(line);
    if (parsed) {
      return parsed;
    }
  }
  return null;
};

const decodeCreateIxArgs = (data: Buffer, isV2: boolean): { name: string; symbol: string; uri: string; creator: string } | null => {
  if (data.length < 8 + 4) {
    return null;
  }
  let o = 8;
  const strings: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const s = readBorshString(data, o);
    if (!s) {
      return null;
    }
    strings.push(s.value);
    o = s.next;
  }
  if (o + 32 > data.length) {
    return null;
  }
  const creator = bytesToBase58(data.subarray(o, o + 32));
  o += 32;
  if (isV2) {
    o += 1; // is_mayhem_mode
    if (o < data.length) {
      o += 1; // is_cashback_enabled (OptionBool / bool in examples)
    }
  }
  return { name: strings[0] ?? "", symbol: strings[1] ?? "", uri: strings[2] ?? "", creator };
};

type JsonIx = {
  programId?: string;
  programIdIndex?: number;
  accounts?: unknown;
  data?: string;
  parsed?: unknown;
};

const normalizeAccountKeys = (message: Record<string, unknown>): string[] => {
  const raw = message.accountKeys;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      out.push(entry);
    } else if (entry && typeof entry === "object" && "pubkey" in entry && typeof (entry as { pubkey: unknown }).pubkey === "string") {
      out.push((entry as { pubkey: string }).pubkey);
    }
  }
  return out;
};

const ixProgramId = (ix: JsonIx, keys: string[]): string | undefined => {
  if (typeof ix.programId === "string") {
    return ix.programId;
  }
  if (typeof ix.programIdIndex === "number" && keys[ix.programIdIndex]) {
    return keys[ix.programIdIndex];
  }
  return undefined;
};

const ixAccountsAsIndices = (ix: JsonIx, keys: string[]): number[] | null => {
  const acc = ix.accounts;
  if (!Array.isArray(acc) || acc.length === 0) {
    return null;
  }
  if (typeof acc[0] === "number") {
    return acc as number[];
  }
  if (typeof acc[0] === "string") {
    const indices: number[] = [];
    for (const pk of acc as string[]) {
      const idx = keys.indexOf(pk);
      if (idx === -1) {
        return null;
      }
      indices.push(idx);
    }
    return indices;
  }
  return null;
};

const decodeIxData = (dataField: string | undefined): Buffer | null => {
  if (!dataField || typeof dataField !== "string") {
    return null;
  }
  try {
    return Buffer.from(bs58.decode(dataField));
  } catch {
    try {
      return Buffer.from(dataField, "base64");
    } catch {
      return null;
    }
  }
};

const tryDecodePumpCreateIx = (ix: JsonIx, keys: string[], pumpProgramId: string): ParsedPumpCreate | null => {
  const pid = ixProgramId(ix, keys);
  if (pid !== pumpProgramId) {
    return null;
  }
  const raw = decodeIxData(ix.data);
  if (!raw || raw.length < 8) {
    return null;
  }
  const isCreate = discEq(raw.subarray(0, 8), CREATE_IX_DISC);
  const isCreateV2 = discEq(raw.subarray(0, 8), CREATE_V2_IX_DISC);
  if (!isCreate && !isCreateV2) {
    return null;
  }
  const accountIndices = ixAccountsAsIndices(ix, keys);
  if (!accountIndices || accountIndices.length < 8) {
    return null;
  }
  const mintIdx = accountIndices[0];
  const bondingIdx = accountIndices[2];
  const userIdx = accountIndices[7];
  const tokenMint = keys[mintIdx];
  const bondingCurve = keys[bondingIdx];
  const user = keys[userIdx];
  if (!tokenMint || !bondingCurve || !user) {
    return null;
  }
  const args = decodeCreateIxArgs(raw, isCreateV2);
  const creator = args?.creator ?? user;
  return {
    tokenMint,
    creator,
    bondingCurve,
    user,
    name: args?.name,
    symbol: args?.symbol,
    uri: args?.uri
  };
};

const collectInstructions = (message: Record<string, unknown>, meta: Record<string, unknown> | undefined): JsonIx[] => {
  const out: JsonIx[] = [];
  const top = message.instructions;
  if (Array.isArray(top)) {
    for (const ix of top) {
      if (ix && typeof ix === "object") {
        out.push(ix as JsonIx);
      }
    }
  }
  const inner = meta?.innerInstructions;
  if (Array.isArray(inner)) {
    for (const group of inner) {
      const list = group && typeof group === "object" && "instructions" in group ? (group as { instructions?: unknown }).instructions : undefined;
      if (!Array.isArray(list)) {
        continue;
      }
      for (const ix of list) {
        if (ix && typeof ix === "object") {
          out.push(ix as JsonIx);
        }
      }
    }
  }
  return out;
};

/**
 * Parse a pump.fun create instruction from raw protobuf transaction data (gRPC path).
 * Eliminates the need for a getTransaction HTTP fallback when log parsing fails.
 */
export const parsePumpCreateFromRawInstruction = (
  pumpProgramId: string,
  accountKeys: string[],
  accountIndices: number[],
  ixData: Buffer
): ParsedPumpCreate | null => {
  if (accountIndices.length < 8 || ixData.length < 8) {
    return null;
  }
  const isCreate = discEq(ixData.subarray(0, 8), CREATE_IX_DISC);
  const isCreateV2 = discEq(ixData.subarray(0, 8), CREATE_V2_IX_DISC);
  if (!isCreate && !isCreateV2) {
    return null;
  }
  const tokenMint = accountKeys[accountIndices[0] ?? -1];
  const bondingCurve = accountKeys[accountIndices[2] ?? -1];
  const user = accountKeys[accountIndices[7] ?? -1];
  if (!tokenMint || !bondingCurve || !user) {
    return null;
  }
  const args = decodeCreateIxArgs(ixData, isCreateV2);
  return {
    tokenMint,
    creator: args?.creator ?? user,
    bondingCurve,
    user,
    name: args?.name,
    symbol: args?.symbol,
    uri: args?.uri
  };
};

/**
 * Fallback when logs omit `Program data:` — decode pump `create` / `create_v2` from `getTransaction` JSON
 * (`result` object: `{ slot, transaction, meta, ... }`).
 */
export const parsePumpCreateFromGetTransactionJson = (
  getTransactionResult: unknown,
  pumpProgramId: string
): ParsedPumpCreate | null => {
  if (!getTransactionResult || typeof getTransactionResult !== "object") {
    return null;
  }
  const root = getTransactionResult as Record<string, unknown>;
  const transaction = root.transaction;
  if (!transaction || typeof transaction !== "object") {
    return null;
  }
  const message = (transaction as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return null;
  }
  const msg = message as Record<string, unknown>;
  const keys = normalizeAccountKeys(msg);
  if (keys.length === 0) {
    return null;
  }
  const meta = root.meta && typeof root.meta === "object" ? (root.meta as Record<string, unknown>) : undefined;
  const instructions = collectInstructions(msg, meta);
  for (const ix of instructions) {
    const parsed = tryDecodePumpCreateIx(ix, keys, pumpProgramId);
    if (parsed) {
      return parsed;
    }
  }
  return null;
};
