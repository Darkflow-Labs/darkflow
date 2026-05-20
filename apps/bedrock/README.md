# @darkflow/bedrock

Agave RPC-node bootstrap app for Darkflow infrastructure.

This app is intentionally **RPC-only** (no voting) and optimized as the base layer for:

- Yellowstone Geyser plugin output
- internal stream ingestion (`apps/geyser` core)
- future global relay topology (`apps/geyser` edge nodes)

## Mode

Bedrock currently ships:

- RPC-only profile (`--no-voting`, `--no-poh-speed-test`, `--full-rpc-api`, `--private-rpc`)
- both testnet and mainnet env templates

## Quick start

1. Copy one env template:

```bash
cp apps/bedrock/config/rpc.testnet.env.example apps/bedrock/config/rpc.testnet.env
cp apps/bedrock/config/rpc.mainnet.env.example apps/bedrock/config/rpc.mainnet.env
```

2. Fill paths and network settings in the chosen env file.

3. Run preflight checks:

```bash
npm run bedrock:preflight --workspace @darkflow/bedrock
```

4. Start node:

```bash
npm run bedrock:start:testnet --workspace @darkflow/bedrock
# or
npm run bedrock:start:mainnet --workspace @darkflow/bedrock
```

## Keys

RPC-only mode does **not** require a vote account, but you still need an identity keypair.

Create identity keypair on your trusted machine:

```bash
solana-keygen new -o validator-keypair.json
```

Copy to node host (example):

```bash
scp validator-keypair.json sol@<host>:/home/sol/validator-keypair.json
```

## Yellowstone plugin

If `BEDROCK_GEYSER_PLUGIN_CONFIG` points to an existing file, startup includes:

```bash
--geyser-plugin-config <path>
```

`start-rpc.sh` validates the plugin `libpath` before launching Agave.

If you need to override `libpath` without editing the source config, set:

```bash
BEDROCK_GEYSER_PLUGIN_LIBPATH=/absolute/path/to/libyellowstone_grpc_geyser.dylib
```

or on Linux:

```bash
BEDROCK_GEYSER_PLUGIN_LIBPATH=/absolute/path/to/libyellowstone_grpc_geyser.so
```

Typical Rust release output path is:

```bash
.../yellowstone-grpc/target/release/libyellowstone_grpc_geyser.{dylib|so}
```

### macOS stability note

On some local macOS machines, Agave can fail during snapshot rebuild with:

```bash
snapshot_storage_rebuilder ... sender should be connected: "SendError(..)"
```

`start-rpc.sh` now sets a very conservative default on macOS:

```bash
RAYON_NUM_THREADS=${BEDROCK_RAYON_NUM_THREADS:-1}
```

You can tune this in your env file (start at `1`, then try `2` only if stable) via:

```bash
BEDROCK_RAYON_NUM_THREADS=1
```

## systemd

Use `systemd/bedrock-rpc.service.example` as template.

## Storage cleanup (testnet)

Bedrock can accumulate snapshot archives and large log files over time. You can prune these while the node is running.

Run on demand:

```bash
npm run bedrock:cleanup:testnet --workspace @darkflow/bedrock
```

or for mainnet:

```bash
npm run bedrock:cleanup:mainnet --workspace @darkflow/bedrock
```

Optional env knobs (in your `rpc.*.env`):

```bash
BEDROCK_KEEP_FULL_SNAPSHOTS=2
BEDROCK_KEEP_INCREMENTAL_SNAPSHOTS=4
BEDROCK_LOG_MAX_MB=1024
```

Recommended cron cadence on testnet:

```bash
*/20 * * * * cd /home/sol/darkflow && /usr/bin/npm run bedrock:cleanup:testnet --workspace @darkflow/bedrock >/tmp/bedrock-cleanup.log 2>&1
```
