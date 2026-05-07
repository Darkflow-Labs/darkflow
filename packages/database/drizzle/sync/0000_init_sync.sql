CREATE SCHEMA "sync";
--> statement-breakpoint
CREATE TABLE "sync"."price_bar" (
	"mint" varchar(64) NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"bucket_interval" varchar(16) NOT NULL,
	"open_sol" double precision NOT NULL,
	"high_sol" double precision NOT NULL,
	"low_sol" double precision NOT NULL,
	"close_sol" double precision NOT NULL,
	"volume_sol" double precision,
	"source" varchar(32) DEFAULT 'yellowstone-grpc' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_bar_mint_bucket_start_bucket_interval_pk" PRIMARY KEY("mint","bucket_start","bucket_interval")
);
--> statement-breakpoint
CREATE TABLE "sync"."price_latest" (
	"mint" varchar(64) PRIMARY KEY NOT NULL,
	"price_sol" double precision NOT NULL,
	"slot" text,
	"source" varchar(32) DEFAULT 'yellowstone-grpc' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
