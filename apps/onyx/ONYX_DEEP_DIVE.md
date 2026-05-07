# Onyx Trading Bot - Deep Dive

This document explains how Onyx works end-to-end: ingestion, risk filtering, execution, exits, runtime safety, telemetry/logging, replay tooling, and every meaningful parameter (including hidden code constants not exposed in `.env`).

## 1) What Onyx Is

Onyx is a Solana pump.fun launch/momentum bot scaffold focused on:

- Fast signal ingestion (`dRPC` logs + optional high-volume lane)
- Risk-first entry filtering (authority checks, concentration checks, creator risk, slippage estimates)
- Controlled execution (`Jito` or `PumpAPI`)
- Strict runtime risk controls (drawdown, failure-rate, loss streak kill switches)
- Deterministic observability (structured JSON logs, metrics, replay harness)

Main runtime entrypoint: `src/main.ts`.

## 2) Runtime Architecture

Onyx runtime boots the following components:

1. **Env + logger + telemetry** (`loadEnv`, `createLogger`, `AlertBus`, `MetricsRegistry`)
2. **Signer + wallet health checks** (`SignerService`)
3. **Risk controls** (`RiskController`)
4. **Pre-trade risk scoring** (`RiskEngine` + `RugSignalProvider`)
5. **Execution stack** (`ExecutionEngine`, `JitoClient`, optional `PumpApiClient`)
6. **Position/exit stack** (`PositionManager`, `ExitEngine`, `ExitExecutor`)
7. **Signal ingestion** (`DrpcLogsSubscriber`)
8. **Price feed mux** (`HybridPriceMux` using primary + optional external quote stream)
9. **Queue/guards** (dedupe, cooldowns, pending-entry warmup gates)
10. **Heartbeat + stale-position watchdog + shutdown summary**

## 3) Signal Ingestion and Launch Detection

### 3.1 dRPC launch subscription (`DrpcLogsSubscriber`)

- Subscribes to program logs via `logsSubscribe`.
- Uses `looksLikePumpfunCreateLogs(...)` to prefilter likely create events.
- Deduplicates by transaction signature (`seenSignatures` with bounded clear at 8,000 entries).
- Parse order:
  1) Parse Anchor `Program data` create-event payload
  2) Fallback log regex extraction (`mint=...`, `creator=...`)
  3) Fallback `getTransaction` JSON decode (instruction decoding + account-key heuristic)
- If websocket closes, reconnects in `1000ms`.

### 3.2 Pump create parser behavior (`pumpCreateParser.ts`)

- Default program id constant: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`.
- Supports both discriminators:
  - `Create`
  - `Create_v2`
- Excludes create-token-account noise.
- Decodes metadata when available: `name`, `symbol`, `uri`, `bondingCurve`, `user`.

## 4) Price Streams and Health

### 4.1 Streams

- **Primary stream**: selected by `ONYX_PRIMARY_PRICE_SOURCE`:
  - `pumpapi` -> `PumpApiPriceStream`
  - `drpc` -> `DrpcPriceStream`
- **Optional external confirmation stream**:
  - Enabled by `ONYX_ENABLE_EXTERNAL_QUOTE_STREAM=true` and URL template set
  - Polled stream emits source `external-confirmation`

### 4.2 `HybridPriceMux`

- Emits ticks from primary and optional external streams.
- Tracks staleness with `ONYX_PRICE_STALE_TIMEOUT_MS`.
- Exposes `healthSnapshot()` with:
  - `primary.stale`
  - `external.stale`
  - `fallbackActive` (true when external is fresh)

### 4.3 Source-quality gate (`SourceHealthTracker`)

- Tracks total, duplicate, stale signals.
- Health thresholds hardcoded:
  - stale rate `< 3000 bps` (30%)
  - duplicate rate `< 1500 bps` (15%)
- Entries are skipped if source health is unhealthy.

## 5) Strategy Lanes

Onyx uses a required CLI section mode:

- `--mode sniping`
- `--mode sweep`

`--mode` is independent from `ONYX_TRADING_MODE`.

### 5.1 Sniping mode

- Uses direct new-launch signals (`source: drpc-logs`) from `DrpcLogsSubscriber`.
- Feeds queue/risk/execution pipeline directly.

### 5.2 Sweep mode (real detector, dRPC-only)

Sweep mode consumes dRPC primary ticks and uses a state machine:

- `watching -> qualified -> dipped -> stabilizing -> armed -> triggered|invalidated`

Core phases:

- Moon qualification (momentum + flow)
- ATH tracking and retracement bounds
- Stabilization without local-low break
- Reversal trigger via buy-flow resurgence

On trigger, it emits queue-ready entries with `source: sweep-detector`.

### 5.3 Sweep profile tuning

- `ONYX_SWEEP_PROFILE=safer|aggressive`
- `safer`: stricter confirmation and wider trailing behavior
- `aggressive`: earlier reversal response with tighter sweep exits

## 6) Entry Pipeline (Exact Decision Order)

For each launch signal (queue worker calls `processLaunchSignal`):

1. **Global cooldown check** (loss streak cooldown)
2. **Creator cooldown check**
3. **Source health check**
4. **Realized-edge guard** (median recent closed-trade pnl gate)
5. **Kill-switch blocked check**
6. **Signal age checks**
   - age threshold per lane
   - hard cap includes queue grace
7. **Duplicate/open/pending checks**
8. **Concurrent exposure cap check** (mode-specific cap)
9. **RiskEngine evaluation**
10. **Position size + economic viability check**
11. **Quality-snipe score gate (if enabled)**
12. **Volume-flow gate (if enabled)**
13. **Build buy intent (slippage/tip policy)**
14. **Price-warmup gate**
   - If not warmed: place in `pendingEntries` (up to 8s)
15. **Execute entry**

## 7) Risk Engine (Pre-Trade)

`RiskEngine` blends hard-fail rules and weighted scoring.

### 7.1 Hard-fail checks

- Creator confidence cooldown active
- Signal stale (`staleSignalMs > maxSignalAgeMs`)
- Mint authority not revoked
- Freeze authority not revoked
- Top-holder concentration exceeds threshold
- Creator supply share exceeds threshold
- Creator risk score exceeds threshold
- Migration state not `bonding`
- Expected slippage exceeds configured max

### 7.2 Risk score breakdown weights

- stale: `10%`
- concentration: `25%`
- creator supply: `20%`
- creator risk: `20%`
- authority: `15%`
- migration: `10%`

### 7.3 Slippage estimation model

Estimated slippage = default slippage + pressure terms from:

- holder concentration
- creator share
- staleness
- slot heuristic
- migration state
- authority risk
- latency pressure

Then capped at `maxSlippageBps + 500`.

## 8) On-Chain Rug Signal Provider

`OnChainRugSignalProvider` fetches and derives:

- Mint authority + freeze authority state
- Bonding curve account state (`bonding` vs `migrated`)
- Top holder concentration (excluding likely curve vault)
- Creator mint share
- Creator signature history count
- Creator risk score (history-derived or blended fallback)

### 8.1 Important hardcoded defaults in provider

- `rpcTimeoutMs = 3500`
- `largestHolderProbe = 10`
- `unknownCreatorRiskScore = 60`
- `minCreatorHistorySignals = 8`
- Worst-case fallback checks use:
  - concentration `10000 bps`
  - creator share `10000 bps`
  - creator risk score `99`

## 9) Position Sizing and Economic Viability

`RiskController.getPositionSizeSol()`:

- Starts from `ONYX_MAX_RISK_PER_TRADE_BPS`
- Reduces by loss streak: `consecutiveLosses * ONYX_STREAK_RISK_REDUCTION_BPS`
- Applies floor:
  - `ONYX_STREAK_RISK_FLOOR_BPS`
  - plus dynamic floor ensuring min notional can still be reached

`isTradeEconomicallyViable(...)` requires:

- Position USD >= `ONYX_MIN_TRADE_NOTIONAL_USD`
- Net edge >= adaptive min edge

Where:

- `edgeNetBps = expectedAlphaBps - (slippage + fee + impact)`
- adaptive min edge relaxes slightly near micro-notional floor

## 10) Trading Modes

Modes in `tradingMode.ts`:

- `aggressiveSpray`
- `balanced`
- `auto`

### 10.1 Auto mode transition

`auto` stays aggressive until:

- closed trades >= `ONYX_MODE_TRANSITION_MIN_TRADES`
- recent median realized pnl >= `ONYX_MODE_TRANSITION_MIN_MEDIAN_REALIZED_BPS`

Then switches to balanced.

### 10.2 Mode profile differences

`aggressiveSpray` profile (hardcoded):

- quality threshold = base minus `8`
- sizing multiplier = `7500 bps` (0.75x)
- max concurrent = at least `2`
- partial TP enabled:
  - trigger `1600 bps` (+16%)
  - sell `5000 bps` (50%)

`balanced` profile:

- quality threshold = base
- sizing multiplier = `10000 bps`
- max concurrent = base env value

## 11) Quality and Volume Gates

### 11.1 Quality-snipe score

Score components:

- risk quality (45%)
- slippage quality (25%)
- tick warmup quality (20%)
- staleness quality (10%)

Dynamic threshold can be raised by execution-failure pressure when `ONYX_DYNAMIC_ENTRY_QUALITY_ENABLED`.

### 11.2 Volume-flow gate

Per rolling window:

- minimum total ticks
- minimum buy ticks

Lane-specific thresholds are used for high-volume lane.

## 12) Execution Stack

`ExecutionEngine` supports:

- `live + pumpapi`: direct API execution
- `live + jito`: build unsigned tx via PumpAPI, sign locally, submit via Jito
- fallback/paper deterministic envelope path

### 12.1 Intent stale protection

Execution aborts if signal age exceeds:

`ONYX_ENTRY_MAX_SIGNAL_AGE_MS + ONYX_ENTRY_TICK_WARMUP_MS + 2000`

### 12.2 Jito client behavior

- Serialized internal queue for submissions
- Rate pacing with `ONYX_JITO_MIN_SUBMIT_INTERVAL_MS`
- Retries up to `ONYX_MAX_EXECUTION_RETRIES`
- Retry delay parsed from `"Retry after Xms"` if present
- Non-retryable errors:
  - failed to deserialize packet
  - invalid transaction
  - signature verification failed
- Optional fallback endpoint
- Optional auth header `x-jito-auth`
- Optional `bundleOnly=true` query parameter

## 13) Exit System

### 13.1 Exit decision logic (`ExitEngine`)

Computes effective pnl after modeled roundtrip costs:

- entry slippage observed at entry
- assumed exit slippage (`ONYX_DEFAULT_SLIPPAGE_BPS`)
- base execution friction (**hardcoded `120 bps`** in runtime wiring)

Exit triggers:

- stop-loss (armed after delay)
- early fast-fail stop-loss before delay
- take-profit max
- trailing stop after reaching min take-profit
- max-hold timeout

Can defer exit if primary/external divergence exceeds max while external quote still fresh.

### 13.2 Exit strategy mode (`ONYX_EXIT_STRATEGY`)

- `tp_sl`: full automatic stop/tp/trailing/max-hold exits
- `time_based`: disables normal profit/loss exits; still allows emergency + timer exits
- `manual`: only emergency exits

### 13.3 Emergency exits

Forced exits happen on:

- liquidity removal tick (`eventType === remove`)
- stale open position with grace elapsed
- kill-switch force-close cycle

## 14) Runtime Risk Controls (Kill Switches)

`RiskController` blocks new entries when any trigger activates:

1. Drawdown trigger (only after min closed trades)
2. Consecutive losses trigger
3. Failure-rate trigger (after min attempts)

Also supports:

- Auto-unblock after cooldown + recovery buffer checks
- Failure-rate degradation pressure that can enforce streak pressure
- Streak-based risk sizing decay and floor

## 15) Logging, Alerts, and Metrics

### 15.1 Logger design

- Uses `pino` structured JSON logs.
- `createLogger(...)` sets `base.component`.
- Writer inserts `\n\n` before each emitted chunk (readability separation in stdout).
- Log level controlled by `ONYX_TELEMETRY_LEVEL`.

### 15.2 Alert bus

`AlertBus.emit(level, msg, details)` logs with `alert: true` payload marker.

### 15.3 Metrics registry

Tracks:

- Signals, rejects, executions, execution failures
- Wins/losses/neutrals
- Exit reason counters
- Median execution latency
- Drawdown max
- Notional skips
- Gain-band hits
- Creator risk bucket stats

Paper summary computes:

- win rate
- avg pnl
- avg win/loss
- expectancy

### 15.4 Heartbeat

Every `30s` logs:

- metrics snapshot
- current mode
- drawdown + limits
- realized edge stats
- wallet balance
- failure rate + limits
- source health
- price stream health
- blocked status

## 16) Hot Reloaded `.env` Keys

Onyx watches `.env` and hot-reloads a subset of runtime keys without restart.

Hot-reload path:

- File watch interval: `1500ms`
- On changes:
  - reload dotenv with override
  - parse via zod
  - apply only allowed mutable keys
  - update `RiskController` and `RiskEngine` runtime config

Not all env keys are hot-reloadable; wallet/signer/network wiring typically requires restart.

## 17) Full Environment Variables

Canonical schema is `src/config/env.ts` (zod defaults + constraints). `.env.example` is close, but not complete.

### 17.1 Present in schema but missing from `.env.example`

These exist in code and are fully supported, but are not listed in `.env.example`:

- `ONYX_ADAPTIVE_EDGE_RELIEF_MAX_BPS` (default `90`)
- `ONYX_ADAPTIVE_EDGE_RELIEF_FLOOR_BPS` (default `150`)
- `ONYX_EARLY_FAST_FAIL_STOP_LOSS_RATIO_BPS` (default `7000`)
- `ONYX_EARLY_FAST_FAIL_STOP_LOSS_MIN_BPS` (default `250`)

### 17.2 Major env groups

- **Mode/runtime**: `ONYX_MODE`, `ONYX_TELEMETRY_LEVEL`, `ONYX_TRADING_MODE`, transition gates
- **RPC/streams**: RPC URLs, stream URLs, source selection, stale timers
- **Execution**: backend, retries, pacing, slippage caps, tip caps/factors
- **Wallet/risk sizing**: key/address, risk-per-trade, notional floor, wallet estimates
- **Risk filters**: holder/creator thresholds, creator-history settings
- **Entry gates**: signal age, warmup ticks/time, quality gate, volume gate
- **High-volume lane**: enable, windows, flow/momentum thresholds, lane cooldown
- **Exit controls**: stop loss, trailing, TP min/max, arming delay, hold timers
- **Kill-switches**: drawdown/failure/loss streak limits + auto-rearm settings
- **Paper mode**: drift/vol/tick cadence + session summary interval
- **External quote**: enable, URL template, poll/grace settings

## 17.3 How Variables Change Strategy Behavior

This section is the practical "what happens if I move this up/down" map.

### A) Entry frequency and selectivity

- `ONYX_ENTRY_MAX_SIGNAL_AGE_MS`
  - **Higher**: accepts older signals, more entries, higher stale-fill risk.
  - **Lower**: fresher entries only, fewer trades, less stale-entry risk.
- `ONYX_ENTRY_MIN_PRIMARY_TICKS`, `ONYX_ENTRY_TICK_WARMUP_MS`
  - **Higher**: stronger warmup confirmation, fewer/more delayed entries.
  - **Lower**: faster entries, more noise.
- `ONYX_QUALITY_SNIPE_ENABLED`, `ONYX_QUALITY_SNIPE_MIN_SCORE`
  - **Higher min score**: tighter quality filter, better average setups, fewer fills.
  - **Lower min score**: more fills, weaker average quality.
- `ONYX_DYNAMIC_ENTRY_QUALITY_ENABLED`, `ONYX_DYNAMIC_ENTRY_QUALITY_DEGRADE_BPS`, `ONYX_DYNAMIC_ENTRY_QUALITY_MAX_ADD`
  - Makes quality gate tighten automatically as failure rate worsens.
  - Larger degrade effect / max add => more defensive behavior under poor execution health.
- `ONYX_VOLUME_GATE_ENABLED`, `ONYX_VOLUME_GATE_WINDOW_MS`, `ONYX_VOLUME_GATE_MIN_TICKS`, `ONYX_VOLUME_GATE_MIN_BUY_TICKS`
  - More strict tick thresholds => fewer, more flow-confirmed entries.
  - Looser thresholds => more entries in thin flow conditions.

### B) Position sizing and aggressiveness

- `ONYX_MAX_RISK_PER_TRADE_BPS`
  - Core sizing lever. **Higher** => larger positions, higher pnl volatility.
  - **Lower** => smaller positions, slower equity swings.
- `ONYX_STREAK_RISK_REDUCTION_BPS`, `ONYX_STREAK_RISK_FLOOR_BPS`
  - Controls how quickly size decays during a loss streak.
  - Higher reduction => faster de-risking after losses.
- `ONYX_MIN_TRADE_NOTIONAL_USD`
  - Raises/lower minimum trade size viability gate.
  - Too high for wallet size can cause frequent "below-min-notional" skips.
- `ONYX_TARGET_BUY_SOL`
  - Baseline desired buy amount before risk cap + mode multipliers.
  - Higher target increases intended size when risk budget allows.
- `ONYX_TRADING_MODE`, `ONYX_MODE_TRANSITION_MIN_TRADES`, `ONYX_MODE_TRANSITION_MIN_MEDIAN_REALIZED_BPS`
  - Controls aggressive vs balanced profile selection.
  - Auto mode stays aggressive until trade-count and realized-pnl gates are met.

### C) Expected-edge viability (trade/no-trade economics)

- `ONYX_MIN_NET_EDGE_BPS`
  - Higher => requires larger modeled net edge; fewer entries.
  - Lower => admits thinner-edge trades; more entries, potentially lower expectancy.
- `ONYX_ADAPTIVE_EDGE_RELIEF_MAX_BPS`, `ONYX_ADAPTIVE_EDGE_RELIEF_FLOOR_BPS`
  - Governs how much edge requirement is relaxed near micro-notional floor.
  - More relief can unlock trades in small-wallet regime.
- `ONYX_ESTIMATED_SOL_USD`
  - Impacts USD notional conversion for viability and size floor logic.
  - Wrong estimate can bias notional gate decisions.

### D) Risk filtering strictness (anti-rug / structural safety)

- `ONYX_MAX_HOLDER_CONCENTRATION_BPS`
  - Lower => stricter anti-whale filter; safer but fewer entries.
  - Higher => more permissive; more entries with concentration risk.
- `ONYX_MAX_CREATOR_SUPPLY_SHARE_BPS`
  - Lower => stricter creator concentration cap.
- `ONYX_MAX_CREATOR_RISK_SCORE`
  - Lower => stricter creator-history acceptance.
- `ONYX_UNKNOWN_CREATOR_RISK_SCORE`, `ONYX_CREATOR_RISK_MIN_HISTORY_SIGNALS`
  - Controls treatment of low-history creators.
  - Higher unknown score / higher minimum history => more conservative filtering.

### E) Slippage + execution cost profile

- `ONYX_DEFAULT_SLIPPAGE_BPS`, `ONYX_MAX_SLIPPAGE_BPS`
  - Affect both risk rejection and intent slippage caps.
  - Higher max allows more volatile fills but increases cost exposure.
- `ONYX_DYNAMIC_TIP_ENABLED`, `ONYX_BASE_TIP_LAMPORTS`, `ONYX_MIN_TIP_LAMPORTS`, `ONYX_MAX_TIP_LAMPORTS`
  - Controls priority-fee pressure and bounds.
  - Higher tips improve inclusion odds but reduce net edge.
- `ONYX_DYNAMIC_TIP_EDGE_FACTOR_BPS`, `ONYX_DYNAMIC_TIP_LATENCY_FACTOR_BPS`, `ONYX_EXECUTION_LATENCY_DEGRADE_MS`
  - Increase tip aggressiveness based on edge/latency pressure.
  - More aggressive factors => stronger fee response during contention.
- `ONYX_MAX_EXECUTION_RETRIES`, `ONYX_JITO_MIN_SUBMIT_INTERVAL_MS`
  - More retries can recover transient failures but can increase late fills.
  - Larger min interval reduces submit burstiness but can reduce reaction speed.

### F) High-volume lane behavior

- `ONYX_HIGH_VOLUME_LANE_ENABLED`
  - Enables/disables momentum-based synthetic entries.
- `ONYX_HIGH_VOLUME_WINDOW_MS`
  - Momentum/flow lookback horizon; larger window smooths but lags.
- `ONYX_HIGH_VOLUME_MIN_TICKS`, `ONYX_HIGH_VOLUME_MIN_BUY_TICKS`, `ONYX_HIGH_VOLUME_MIN_MOMENTUM_BPS`
  - Higher values demand stronger sustained flow and momentum.
- `ONYX_HIGH_VOLUME_EXCLUDE_NEW_LAUNCH_MS`
  - Larger value forces lane to ignore fresher launches longer.
- `ONYX_HIGH_VOLUME_ENTRY_COOLDOWN_MS`
  - Per-mint throttling for repeat high-volume entries.
- `ONYX_HIGH_VOLUME_SIZING_MULTIPLIER_BPS`
  - Lane-specific size multiplier on top of mode multiplier.
- `ONYX_HIGH_VOLUME_MIN_EDGE_BONUS_BPS`
  - Extra edge requirement for high-volume entries.
- `ONYX_HIGH_VOLUME_QUALITY_MIN_SCORE`
  - Lane-specific quality floor.

### G) Exit profile and holding behavior

- `ONYX_EXIT_STRATEGY`
  - `tp_sl`: full reactive profit/loss exits.
  - `time_based`: suppresses normal tp/sl exits, relies on timer/emergency.
  - `manual`: only emergency exits.
- `ONYX_STOP_LOSS_BPS`
  - Lower (tighter) => quicker loss cuts.
  - Higher (wider) => more adverse excursion tolerated.
- `ONYX_EARLY_FAST_FAIL_STOP_LOSS_RATIO_BPS`, `ONYX_EARLY_FAST_FAIL_STOP_LOSS_MIN_BPS`
  - Governs pre-arming stop-loss severity.
  - More strict early fail catches immediate reversals sooner.
- `ONYX_EXIT_ARMING_DELAY_MS`
  - Delay before normal stop-loss arms; larger delay tolerates early noise.
- `ONYX_TAKE_PROFIT_MIN_BPS`, `ONYX_TAKE_PROFIT_MAX_BPS`
  - Defines trailing eligibility and hard TP ceiling.
- `ONYX_TRAILING_STOP_BPS`
  - Smaller trailing stop => tighter profit lock.
- `ONYX_MAX_HOLD_MS`
  - Hard time exit; lower values increase turnover.
- `ONYX_POSITION_STALE_EXIT_MS`, `ONYX_STALE_EXIT_GRACE_MS`
  - Controls stale-tick emergency exit sensitivity.
- `ONYX_MAX_SOURCE_DIVERGENCE_BPS`, `ONYX_EXTERNAL_QUOTE_GRACE_MS`
  - Larger divergence threshold reduces deferred exits from feed mismatch.

### H) Kill switches and system survivability

- `ONYX_DAILY_MAX_DRAWDOWN_BPS`, `ONYX_DRAWDOWN_MIN_CLOSED_TRADES`
  - Drawdown block trigger and activation maturity.
- `ONYX_MAX_CONSECUTIVE_LOSSES`
  - Streak-based hard stop threshold.
- `ONYX_MAX_FAILURE_RATE_BPS`, `ONYX_KILL_SWITCH_MIN_ATTEMPTS`
  - Execution failure-rate kill switch, with minimum sample gate.
- `ONYX_KILL_SWITCH_COOLDOWN_MS`
  - Minimum blocked period before auto-rearm check.
- `ONYX_KILL_SWITCH_AUTO_UNBLOCK_DRAWDOWN_BUFFER_BPS`, `ONYX_KILL_SWITCH_AUTO_UNBLOCK_FAILURE_BUFFER_BPS`
  - Recovery margin required for automatic unblock.
- `ONYX_EXECUTION_FAILURE_DEGRADE_BPS`
  - Failure pressure level that starts imposing streak-like de-risking behavior.

### I) Realized-edge governance

- `ONYX_REALIZED_EDGE_WINDOW_TRADES`
  - Recent closed-trade window used for median realized edge checks.
- `ONYX_REALIZED_EDGE_MIN_CLOSED_TRADES`
  - Minimum closed trades before realized-edge guard can block entries.
- `ONYX_REALIZED_EDGE_MIN_MEDIAN_BPS`
  - Threshold for "entry blocked by realized-edge guard."
  - Higher threshold = stricter expectancy requirement.

### J) Paper-mode realism knobs

- `ONYX_MODE=paper` activates synthetic price evolution for open positions.
- `ONYX_PAPER_PRICE_TICK_MS`, `ONYX_PAPER_PRICE_DRIFT_BPS`, `ONYX_PAPER_PRICE_VOL_BPS`
  - Control cadence and stochastic drift/vol of paper ticks.
- `ONYX_PAPER_RELAX_FILTERS`
  - In paper mode, relaxes some risk thresholds to increase signal throughput for testing.
- `ONYX_PAPER_SUMMARY_INTERVAL_MS`
  - Paper summary logging cadence.

### K) Operational hygiene knobs

- `ONYX_CONCURRENT_SKIP_ALERT_COOLDOWN_MS`
  - Alert throttling for repeated skip/block reasons.
- `ONYX_LAUNCH_TX_FETCH_TIMEOUT_MS`, `ONYX_LAUNCH_TX_FETCH_CONCURRENCY`
  - Affects throughput/reliability of fallback launch decode.
- `ONYX_DRPC_LOG_PAYLOAD_DETAILS`
  - Enables detailed log payload diagnostics.

## 18) Hardcoded Constants Not Exposed in `.env`

Important non-env constants baked into behavior:

- `growthMilestonesUsd = [50, 75, 100]`
- Hot reload watch interval `1500ms`
- Entry pending expiry `8000ms`
- Queue hard-age grace: `ONYX_ENTRY_TICK_WARMUP_MS + 2000`
- Execution max-intent-age extra buffer `+2000ms`
- Risk engine creator confidence cooldown `15000ms`
- `computeExpectedAlphaBps` coefficients:
  - quality factor `18`
  - flow tick factor `30`
  - flow buy factor `45`
  - clamp limits `25` and `16`
- `computeExpectedImpactBps` coefficients:
  - `candidateBuySol * 7500` capped to `320`
  - residual slippage factor `0.18`
- Dynamic-fee fallback when dynamic tips disabled: `120 bps`
- Exit engine base execution friction wiring: `120 bps`
- Position stale watchdog tick interval: `1000ms`
- Heartbeat interval: `30000ms`
- dRPC subscriber signature cache reset threshold: `8000`
- Reconnect delay (streams/subscriber): `1000ms`
- Source health hard thresholds:
  - stale `<3000 bps`
  - duplicate `<1500 bps`
- Trading mode profile constants:
  - aggressive quality offset `-8`
  - aggressive sizing `7500 bps`
  - aggressive partial TP trigger `1600 bps`
  - aggressive partial TP sell `5000 bps`
- Realized-wallet-pnl sanity guards:
  - max loss formula multiplier `1.35` and offset `300`
  - max gain formula multiplier `2.5` and offset `500`
  - contradictory TP checks use additional internal thresholds (`15%`, `35%`, `250 bps`)

## 19) Replay and Testing Utilities

### 19.1 Replay engine

- Replays fixture events with time gaps scaled by speed multiplier.
- Includes closed-loop expectancy simulator with fixed synthetic costs:
  - impact `180 bps`
  - fee `80 bps`
  - slippage `420 bps`

### 19.2 Autotune script (`scripts/autotune-env.ts`)

Consumes runtime logs and proposes `.env` tuning decisions based on observed regime:

- Rejection mix (slippage vs concentration)
- Cost-too-high vs below-notional skip profile
- Early outcome quality
- Stop-loss dominance

Bounded keys and defaults are hardcoded in script and can be optionally auto-applied with `--apply`.

### 19.3 Acceptance thresholds (`runtime/acceptanceMetrics.ts`)

Defines static thresholds for simulation/paper/micro-live acceptance:

- Simulation drawdown/winrate/latency limits
- Paper failure/missed-signal limits
- Micro-live loss/failure/skip limits

## 20) Known Scaffold Limitations

From current implementation:

- Transaction builder fallback path uses deterministic JSON envelope placeholder (not full instruction encoding).
- Real execution depends on PumpAPI tx build + signing + Jito submit path.
- Rug checks are functional on-chain reads, but some scoring remains heuristic by design.

---

If you want, I can generate a second document that is purely operator-focused (playbook style): recommended baseline profiles (ultra-safe, balanced, aggressive), with concrete `.env` presets and when to switch modes.
