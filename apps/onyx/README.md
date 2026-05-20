# Onyx

Onyx is a speed + safety focused pump.fun new-launch bot scaffold for Solana using dRPC (reads/subscriptions) and Jito Block Engine (send path).

## What is implemented

- dRPC `logsSubscribe` ingestion for new launch signals.
- Deterministic replay engine and fixtures for non-live validation.
- Anti-rug risk engine with hard fails and explicit rejection reasons.
- Execution pipeline with adaptive slippage/tip policy and Jito JSON-RPC send.
- Runtime risk controls:
  - max risk per trade sizing
  - daily drawdown kill switch
  - consecutive-loss kill switch
  - execution-failure-rate kill switch
  - cooldown-based kill-switch auto-rearm with recovery buffers
  - streak-aware risk throttling (risk-per-trade decays during loss streaks)
  - minimum attempt gate before failure-rate kill switch can trigger
- Telemetry heartbeat + alert bus + signer health checks.
- Queue-based launch processing to avoid bursty signal races.
- Trade outcomes now track realized wallet PnL (not only price-move PnL) for risk controls.
- Drawdown kill-switch uses realized equity drawdown and can require a minimum number of closed trades before activating (`ONYX_DRAWDOWN_MIN_CLOSED_TRADES`).

## Redis tick interest (Geyser coordination)

When `ONYX_TICK_INTEREST_WATCH_ENABLED=true`, Onyx registers `df:tick:watch:<mint>` while a position is open (and refreshes on ticks for open mints). Use the **same** Redis as `REDIS_PUBSUB_*`. Pairs with Geyser core `GEYSER_INTEREST_FILTER_ENABLED` so Redis only carries ticks for watched mints.

## Run

```bash
cd apps/onyx
cp .env.example .env
npm install
npm run check-types
npm run dev -- --mode sniping
# or
npm run dev -- --mode sweep
# npm also supports positional mode:
npm run dev -- sniping
```

### Section Mode (CLI)

- `--mode sniping`: only consumes direct new-launch signals from `DrpcLogsSubscriber`.
- `--mode sweep`: disables direct launch queueing and runs the dRPC momentum+dips detector.
- You can pass mode as either `--mode <value>` or positional (`sniping|sweep`) after `--`.

### Sweep profiles

- `ONYX_SWEEP_PROFILE=safer|aggressive`
- `safer` defaults to stricter confirmation and wider trailing stop.
- `aggressive` allows earlier reversal entry with tighter sweep stop/trailing settings.

## Micro-wallet profile ($25-$30)

- Set `ONYX_MICRO_WALLET_MIN_USD=25` and `ONYX_MICRO_WALLET_MAX_USD=30`.
- Keep `ONYX_MAX_CONCURRENT_POSITIONS=1` for early capital preservation.
- Use fixed-percent sizing via `ONYX_MAX_RISK_PER_TRADE_BPS`.
- Target gain band is controlled with:
  - `ONYX_TAKE_PROFIT_MIN_BPS=1500` (15%)
  - `ONYX_TAKE_PROFIT_MAX_BPS=2500` (25%)
- Entries are skipped automatically when notional/edge viability checks fail.
- Edge viability now enforces net-edge accounting (`expectedAlpha - impact - fees - slippage`).
- Entries are also skipped when signal age exceeds `ONYX_ENTRY_MAX_SIGNAL_AGE_MS`.

## Durable market data (Step 1)

Onyx now writes raw ticks + derived market tables via the sync writer path:

- `sync.price_tick`
- `sync.price_bar` (`1s`, `5s`, `1m`, `5m`, `1h`)
- `sync.price_latest`
- `sync.token_metrics`

Related knobs:

- `ONYX_MARKET_SYNC_ENABLED`
- `ONYX_MARKET_SYNC_BAR_BUCKET_MS` (legacy compatibility; bars now persist multi-interval)
- `ONYX_MARKET_SYNC_BAR_THROTTLE_MS` (legacy compatibility)

Retention prune job (from repo root):

```bash
npm run prune:market-data --workspace @darkflow/sync
```

Env controls for pruning:

- `SYNC_PRICE_TICK_RETENTION_DAYS` (default `3`)
- `SYNC_PRICE_BAR_RETENTION_DAYS` (default `30`)
- `SYNC_TRADE_EVENT_RETENTION_DAYS` (default `30`)
- `SYNC_LIQUIDITY_RETENTION_DAYS` (default `30`)
- Live entries require primary-price warmup per mint:
  - at least `ONYX_ENTRY_MIN_PRIMARY_TICKS` ticks
  - spread over at least `ONYX_ENTRY_TICK_WARMUP_MS`
- Optional quality-snipe score gate:
  - enable with `ONYX_QUALITY_SNIPE_ENABLED=true`
  - require minimum score via `ONYX_QUALITY_SNIPE_MIN_SCORE`
  - score combines risk score, expected slippage, signal freshness, and primary tick quality
  - optional dynamic quality uplift when execution health degrades
- Optional high-volume momentum lane (alongside new-launch lane):
  - enable with `ONYX_HIGH_VOLUME_LANE_ENABLED=true`
  - scans rolling primary stream activity and momentum for already-active mints
  - excludes very recent launches via `ONYX_HIGH_VOLUME_EXCLUDE_NEW_LAUNCH_MS`
  - requires high-flow + momentum thresholds:
    - `ONYX_HIGH_VOLUME_MIN_TICKS`
    - `ONYX_HIGH_VOLUME_MIN_BUY_TICKS`
    - `ONYX_HIGH_VOLUME_MIN_MOMENTUM_BPS`
  - uses lane-specific sizing and edge requirements:
    - `ONYX_HIGH_VOLUME_SIZING_MULTIPLIER_BPS`
    - `ONYX_HIGH_VOLUME_MIN_EDGE_BONUS_BPS`
    - `ONYX_HIGH_VOLUME_QUALITY_MIN_SCORE`
- Mode system (`ONYX_TRADING_MODE`):
  - `aggressiveSpray`: lower quality threshold, smaller sizing multiplier, supports partial TP
  - `balanced`: stricter quality threshold and conservative sizing
  - `auto`: starts aggressive and transitions to balanced after configured trade/performance gates
  - transition controls:
    - `ONYX_MODE_TRANSITION_MIN_TRADES`
    - `ONYX_MODE_TRANSITION_MIN_MEDIAN_REALIZED_BPS`
- `ONYX_TRADING_MODE` is separate from CLI `--mode`:
  - `--mode` selects the strategy lane (`sniping` vs `sweep`)
  - `ONYX_TRADING_MODE` tunes aggressiveness profile used by shared runtime logic
- Exit behavior is configurable with `ONYX_EXIT_STRATEGY`:
  - `tp_sl` (default): stop-loss + trailing/take-profit + max-hold
  - `time_based`: only stale/liquidity emergency exits + max-hold timer
  - `manual`: only emergency exits (no automatic profit/loss time exits)
- Aggressive mode supports partial TP before full exit:
  - first partial trigger around +16% (config baked in mode profile)
  - sells 50% then leaves remainder for trailing/full exits

Replay:

```bash
npm run replay
# test aggressive mode behavior
ONYX_TRADING_MODE=aggressiveSpray npm run replay
# test balanced mode behavior
ONYX_TRADING_MODE=balanced npm run replay
```

## Security model

- Private key is loaded from env at runtime through `SignerService`.
- Signer logic is isolated behind an abstraction so it can be swapped with HSM/KMS later.
- Do not commit `.env`.

## Rollout runbook

1. **Phase 1 - P0 enabled (feature defaults)**
   - Set `ONYX_MODE=paper`.
   - Replay historical fixtures and verify signal quality + rejection reasons.
   - Validate closed-loop replay summary and ensure net expectancy is not deeply negative.
2. **Phase 2 - adaptive execution/risk**
   - Enable dynamic tips and adaptive quality (`ONYX_DYNAMIC_TIP_ENABLED`, `ONYX_DYNAMIC_ENTRY_QUALITY_ENABLED`).
   - Verify stale-intent aborts and kill-switch auto-rearm behavior.
3. **Micro-live**
   - Use very small `ONYX_TARGET_BUY_SOL`.
   - Start with `ONYX_TRADING_MODE=aggressiveSpray`.
   - Watch heartbeat metrics for failure spikes and drawdown.
   - Confirm kill switches trigger correctly under forced bad conditions.
4. **Capped live scale-up**
   - Move to `ONYX_TRADING_MODE=auto` or `balanced` once realized edge stabilizes.
   - Increase target size gradually only after 7-day stable run.
   - Keep drawdown/failure kill-switch thresholds unchanged until stability is proven.

## Known limitations in this scaffold

- The transaction builder currently emits a deterministic base64 envelope placeholder.
- You still need to plug in real pump.fun instruction encoding/signing.
- Rug checks currently use deterministic synthetic data provider and should be replaced with real on-chain/API adapters.
