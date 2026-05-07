# Darkflow Geyser Deployment Runbook

## Topology

- `core` node (single region, EU recommended) ingests Yellowstone and publishes events.
- `edge` nodes (global regions) subscribe to event channels and serve WebSocket clients.
- Shared pub/sub channels:
  - `GEYSER_REDIS_LAUNCH_CHANNEL`
  - `GEYSER_REDIS_PRICE_TICK_CHANNEL`

## Core Region (cheap/high-performance baseline)

- Suggested hardware: bare metal Ryzen 7950X class, 128GB+ RAM, NVMe
- Suggested region: AMS/FRA
- Required env:
  - `GEYSER_ROLE=core`
  - `GEYSER_UPSTREAM_ENDPOINT`
  - `GEYSER_PROGRAM_ID`
  - Redis/Upstash credentials

## Edge Regions

- Suggested regions: `iad`, `sjc`, `ams`, `sin`
- Small instances are enough (no validator required)
- Required env:
  - `GEYSER_ROLE=edge`
  - `GEYSER_PROGRAM_ID`
  - Redis/Upstash credentials

## Rollout Steps

1. Deploy core first and verify `/health` + pub/sub traffic.
2. Deploy one edge relay and verify launch/tick fanout.
3. Roll out additional edges region-by-region.
4. Route clients to nearest relay via DNS/load balancer.

## Smoke Checklist

- `npm run check-types --workspace @darkflow/geyser`
- `npm run test --workspace @darkflow/geyser`
- core can ingest and publish launch/tick events
- edge can relay both event types without direct Yellowstone connectivity

## Failure Mode Defaults

- If edge loses Redis/Upstash, it should fail fast and restart.
- If core loses Yellowstone, reconnect with exponential backoff.
- Keep frontend clients on edge relays; never expose upstream Yellowstone directly.
