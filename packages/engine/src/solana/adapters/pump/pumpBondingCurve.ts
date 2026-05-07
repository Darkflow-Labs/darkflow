import { PublicKey } from "@solana/web3.js";

/** Anchor account discriminator for `BondingCurve` (`pump_fun_idl.json` accounts). */
export const PUMP_BONDING_CURVE_ACCOUNT_DISC = Buffer.from([23, 183, 248, 55, 96, 216, 172, 96]);

export type ParsedPumpBondingCurve = {
  complete: boolean;
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  creator: string;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
};

export const deriveBondingCurvePda = (mint: PublicKey, pumpProgramId: PublicKey, seed: "bonding-curve" | "bonding-curve-v2") =>
  PublicKey.findProgramAddressSync([Buffer.from(seed), mint.toBuffer()], pumpProgramId)[0];

/**
 * Decode pump `BondingCurve` account data (8-byte Anchor disc + Borsh fields per IDL).
 */
export const parsePumpBondingCurveAccount = (data: Buffer): ParsedPumpBondingCurve | null => {
  if (data.length < 8 + 40 + 1 + 32 + 2) {
    return null;
  }
  if (!data.subarray(0, 8).equals(PUMP_BONDING_CURVE_ACCOUNT_DISC)) {
    return null;
  }
  let o = 8;
  const u64 = () => {
    const v = data.readBigUInt64LE(o);
    o += 8;
    return v;
  };
  const virtualTokenReserves = u64();
  const virtualSolReserves = u64();
  const realTokenReserves = u64();
  const realSolReserves = u64();
  const tokenTotalSupply = u64();
  const complete = data.readUInt8(o) !== 0;
  o += 1;
  const creatorPk = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const isMayhemMode = o < data.length ? data.readUInt8(o) !== 0 : false;
  o += 1;
  const isCashbackCoin = o < data.length ? data.readUInt8(o) !== 0 : false;
  return {
    complete,
    virtualTokenReserves,
    virtualSolReserves,
    realTokenReserves,
    realSolReserves,
    tokenTotalSupply,
    creator: creatorPk.toBase58(),
    isMayhemMode,
    isCashbackCoin
  };
};
