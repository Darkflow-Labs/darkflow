# @darkflow/geyser

Darkflow-operated Yellowstone platform node that supports two roles:

- `core`: subscribes to Yellowstone gRPC and publishes normalized events
- `edge`: stateless regional relay that subscribes to Redis/Upstash and serves clients

Both roles can expose authenticated WebSocket fanout.

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
