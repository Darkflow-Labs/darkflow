# @darkflow/geyser

Darkflow-operated Yellowstone platform node that supports two roles:

- `core`: subscribes to Yellowstone gRPC and publishes normalized events
- `edge`: stateless regional relay that subscribes to Redis/Upstash and serves clients

Both roles can expose authenticated WebSocket fanout.

## Redis interest filtering (optional)

Core can skip noisy Redis pub/sub when nobody has declared interest (same Redis as channels):

| Redis key | Meaning |
|-----------|---------|
| `df:tick:watch:<mint>` | At least one Sync WS subscriber, Onyx open position, or similar touched this mint |
| `df:tick:fanout_watch` | At least one Geyser public WS client currently wants the `ticks` stream |
| `df:launch:watch` | At least one Geyser public WS client wants `launches` |

Environment:

- `GEYSER_INTEREST_FILTER_ENABLED` — gate tick publishes (default off).
- `GEYSER_INTEREST_FILTER_APPLY_TO_LAUNCHES` — when enabling filtering, optionally gate launches too (default off so launch channel is not silenced until WS clients register).
- `GEYSER_INTEREST_WATCH_TTL_MS` / `GEYSER_INTEREST_WATCH_REFRESH_MS` — TTL and refresh for WS-maintained watch keys.

[`apps/sync`](../sync) sets `df:tick:watch:<mint>` when clients subscribe (`SYNC_TICK_INTEREST_REGISTRY_ENABLED`).

Onyx does **not** connect through this Node service; it uses Yellowstone gRPC / RPC URLs directly ([`ONYX_INTERNAL_GEYSER_ENDPOINT`](../onyx/src/config/env.ts), [`ONYX_RPC_HTTP_URL`](../onyx/src/config/env.ts)).

## Upstream Reference

Use upstream Yellowstone as documentation/reference only:

- https://github.com/rpcpool/yellowstone-grpc

## Run

1. Copy `.env.example` to `.env` and configure `GEYSER_*`.
2. Set `GEYSER_ROLE=core` for the single ingest region, or `GEYSER_ROLE=edge` for regional relays.
3. Start service:

```bash
npx turbo run dev --filter=./apps/geyser
```

## Health

When WS server is enabled, health is exposed at:

- `GET /health` on `GEYSER_WS_HOST:GEYSER_WS_PORT`

## Stream Frames

Outgoing stream frames:

- `type: "launch"` launch signals
- `type: "tick"` price ticks

Clients can send control messages:

- `{"op":"subscribe","stream":"launches"}`
- `{"op":"unsubscribe","stream":"ticks"}`

## Suggested Deployment Topology

- Single `core` node in EU close to validator infra
- Multiple low-cost `edge` relays (`iad`, `sjc`, `ams`, `sin`)
- Shared Redis/Upstash pub/sub channels:
  - `GEYSER_REDIS_LAUNCH_CHANNEL`
  - `GEYSER_REDIS_PRICE_TICK_CHANNEL`
