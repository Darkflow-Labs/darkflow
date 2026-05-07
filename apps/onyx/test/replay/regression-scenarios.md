# ONYX Regression Scenarios

## Scenario 1: DNS stream outage and recovery
- Stop primary stream for 30-60s, then restore.
- Verify entries stay blocked while `sourceHealth.healthy=false`.
- Verify entries resume only after health is restored and queue conditions are valid.

## Scenario 2: Consecutive loss streak with auto-rearm
- Feed replay ticks producing 4+ consecutive losses.
- Verify kill switch blocks entries immediately at threshold.
- Verify cooldown (`ONYX_KILL_SWITCH_COOLDOWN_MS`) elapses.
- Verify auto-unblock only occurs when drawdown/failure are below configured recovery buffers.

## Scenario 3: Execution latency degradation
- Inject high-latency execution responses (> `ONYX_EXECUTION_LATENCY_DEGRADE_MS`).
- Verify dynamic tip logic increases tip pressure but remains bounded by max caps.
- Verify quality threshold increases and low-quality entries are filtered out.

## Scenario 4: Stale intent protection
- Delay execution past `ONYX_ENTRY_MAX_SIGNAL_AGE_MS`.
- Verify execution aborts with stale-intent error and no position opens.

## Scenario 5: Adaptive streak risk sizing
- Trigger loss streak and inspect `getPositionSizeSol()` output.
- Verify risk per trade is reduced by `ONYX_STREAK_RISK_REDUCTION_BPS` and never falls below `ONYX_STREAK_RISK_FLOOR_BPS`.

## Scenario 6: No-trade-lock regression
- Feed 30+ viable launches where edge is near threshold with micro notionals.
- Verify `decisionClass="promotable"` trades can pass in balanced mode under bounded conditions.
- Verify `costTooHighCount` does not dominate while kill-switch protections remain active.

## Scenario 7: Stale queue surge handling
- Inject a burst of launches with delayed risk evaluation and mixed freshness.
- Verify freshest candidates are evaluated first and stale queue entries are skipped.
- Verify hard-cap stale skips are tracked separately from queue-age skips.

## Scenario 8: Concentration sensitivity sweep
- Replay identical launch set with holder caps at 3500, 4500, and 5500 bps.
- Compare reject mix, executed/100-valid-signals, and fast-stopout rate.
- Ensure balanced-safe cap band improves participation without stopout explosion.
