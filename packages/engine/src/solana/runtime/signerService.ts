import type { Logger } from "pino";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

type SignerInput = {
  privateKeyBase58: string;
  logger: Logger;
};

export class SignerService {
  private readonly keyMaterial: string;
  private readonly logger: Logger;
  private readonly keypair?: Keypair;

  public constructor({ privateKeyBase58, logger }: SignerInput) {
    this.keyMaterial = privateKeyBase58;
    this.logger = logger;
    try {
      this.keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
    } catch {
      this.keypair = undefined;
    }
  }

  public healthCheck() {
    const healthy = this.keypair !== undefined;
    if (!healthy) {
      this.logger.error("Signer key material failed health check.");
      return false;
    }
    return true;
  }

  public getPublicKeyLabel() {
    if (!this.keypair) {
      return `${this.keyMaterial.slice(0, 4)}...${this.keyMaterial.slice(-4)}`;
    }
    const address = this.keypair.publicKey.toBase58();
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }

  public getPrivateKeyBase58() {
    return this.keyMaterial;
  }

  public getWalletAddress() {
    return this.keypair?.publicKey.toBase58();
  }

  public getKeypair() {
    return this.keypair;
  }
}
