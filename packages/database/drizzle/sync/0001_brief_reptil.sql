CREATE TABLE "sync"."liquidity_snapshot" (
	"mint" varchar(64) NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"pool_address" varchar(64) NOT NULL,
	"liquidity_sol" double precision NOT NULL,
	"liquidity_usd" double precision,
	"source" varchar(32) DEFAULT 'yellowstone-grpc' NOT NULL,
	CONSTRAINT "liquidity_snapshot_mint_pool_address_captured_at_pk" PRIMARY KEY("mint","pool_address","captured_at")
);
--> statement-breakpoint
CREATE TABLE "sync"."price_tick" (
	"mint" varchar(64) NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"price_sol" double precision NOT NULL,
	"slot" text,
	"source" varchar(32) DEFAULT 'yellowstone-grpc' NOT NULL,
	"event_type" varchar(32),
	CONSTRAINT "price_tick_mint_received_at_pk" PRIMARY KEY("mint","received_at")
);
--> statement-breakpoint
CREATE TABLE "sync"."token_metrics" (
	"mint" varchar(64) PRIMARY KEY NOT NULL,
	"price_change_1m_bps" double precision,
	"price_change_5m_bps" double precision,
	"price_change_1h_bps" double precision,
	"price_change_24h_bps" double precision,
	"volume_1m_sol" double precision,
	"volume_5m_sol" double precision,
	"volume_1h_sol" double precision,
	"volatility_1h_bps" double precision,
	"momentum_5m_bps" double precision,
	"source" varchar(32) DEFAULT 'derived' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync"."trade_event" (
	"mint" varchar(64) NOT NULL,
	"tx_signature" varchar(128) NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"side" varchar(8) NOT NULL,
	"size_token" double precision,
	"size_sol" double precision,
	"price_sol" double precision NOT NULL,
	"source" varchar(32) DEFAULT 'yellowstone-grpc' NOT NULL,
	CONSTRAINT "trade_event_tx_signature_event_at_pk" PRIMARY KEY("tx_signature","event_at")
);
--> statement-breakpoint
CREATE INDEX "liquidity_snapshot_mint_captured_idx" ON "sync"."liquidity_snapshot" USING btree ("mint","captured_at");--> statement-breakpoint
CREATE INDEX "liquidity_snapshot_pool_captured_idx" ON "sync"."liquidity_snapshot" USING btree ("pool_address","captured_at");--> statement-breakpoint
CREATE INDEX "price_tick_mint_received_idx" ON "sync"."price_tick" USING btree ("mint","received_at");--> statement-breakpoint
CREATE INDEX "price_tick_received_idx" ON "sync"."price_tick" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "trade_event_mint_event_idx" ON "sync"."trade_event" USING btree ("mint","event_at");--> statement-breakpoint
CREATE INDEX "trade_event_event_idx" ON "sync"."trade_event" USING btree ("event_at");--> statement-breakpoint
CREATE INDEX "price_bar_mint_interval_start_idx" ON "sync"."price_bar" USING btree ("mint","bucket_interval","bucket_start");--> statement-breakpoint
CREATE INDEX "price_bar_bucket_start_idx" ON "sync"."price_bar" USING btree ("bucket_start");