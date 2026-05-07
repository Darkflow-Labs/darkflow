import { GrpcSubscriber } from "@darkflow/engine/solana/connectors";
import { GrpcPriceStream } from "@darkflow/engine/solana/ingest";
import type { LaunchSignal } from "@darkflow/engine/core";
import type { PriceTick } from "@darkflow/engine/solana/ingest";

type GeyserIngestorInput = {
  endpoint: string;
  xToken?: string;
  programId: string;
  logger: unknown;
};

type LaunchHandler = (signal: LaunchSignal) => void;
type TickHandler = (tick: PriceTick) => void;

export class GeyserIngestor {
  private readonly launchSubscriber: GrpcSubscriber;
  private readonly tickSubscriber: GrpcPriceStream;
  private readonly logger: { info: (...args: unknown[]) => void };

  public constructor(input: GeyserIngestorInput) {
    this.logger = input.logger as { info: (...args: unknown[]) => void };
    this.launchSubscriber = new GrpcSubscriber({
      endpoint: input.endpoint,
      xToken: input.xToken,
      programId: input.programId,
      logger: input.logger as never
    });
    this.tickSubscriber = new GrpcPriceStream({
      endpoint: input.endpoint,
      xToken: input.xToken,
      programId: input.programId,
      logger: input.logger as never
    });
  }

  public onLaunch(handler: LaunchHandler): void {
    this.launchSubscriber.onLaunch(handler);
  }

  public onTick(handler: TickHandler): void {
    this.tickSubscriber.onTick(handler);
  }

  public start(): void {
    this.launchSubscriber.start();
    this.tickSubscriber.start();
    this.logger.info("Started Yellowstone launch and tick ingestors");
  }

  public stop(): void {
    this.launchSubscriber.stop();
    this.tickSubscriber.stop();
    this.logger.info("Stopped Yellowstone launch and tick ingestors");
  }
}
