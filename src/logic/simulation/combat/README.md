# simulation/combat

Readonly combat profile contracts for future bout-kernel work.

`kernel.ts` is the minimal shared combat kernel boundary. It is a pure thin wrapper around `resolveBoutWinProb`: callers must pass already-normalized ability, style, injury, bonus, and optional soft-cap values. Source labels and metadata are diagnostic only and must not affect probability. Player base/baseline calls and the NPC main probability call route through this boundary.

`BashoCombatProfile` describes stable or basho-level combat inputs such as raw power, raw ability, basho form, stable factor, competitive factor, body metrics, style, and rank baseline. It deliberately does not own per-bout state.

Do not put these values in a profile:

- current wins / losses
- streaks
- calendar day or bout ordinal
- pressure context
- expected wins so far
- random bout noise
- fusen / kyujo resolution
- engagement, win route, kimarite, or result mutation

Current builders are pure and readonly:

- `buildPlayerBashoCombatProfile`
- `buildNpcBashoCombatProfile`
- `buildGeneratedOpponentBashoCombatProfile`

`playerCompat.ts` is the player-bout compatibility boundary. It currently normalizes and forwards the existing `calculateBattleResult` inputs to the legacy player battle resolver without changing formulas, RNG order, or return shape.

`npcCompat.ts` is the NPC-bout compatibility boundary behind `simulateNpcBout`. It stages the existing NPC flow into branch classification, fought-bout probability input construction, fought-bout metric mutation, result roll, and record mutation. It must preserve the normal-path RNG order (`aNoise`, `bNoise`, result roll), probability inputs, fusen/no-contest behavior, and mutation order.

`preBoutPhase.ts` is diagnostic-only infrastructure for future phase / explanation work. It derives inspectable PreBoutPhase weights from already-available combat descriptors and must not affect production battle resolution until a separate behavior task accepts the RNG and distribution impact.

`boutFlowModel.ts` defines the future vocabulary for reading one bout as `OpeningPhase -> ControlPhase -> FinishRoute -> Kimarite`. It is a contract-only layer: current `PreBoutPhase` is the OpeningPhase predecessor, `BoutEngagement` / `EngagementPhase` is the ControlPhase predecessor, `WinRoute` is the FinishRoute predecessor, and `KimariteOutcomeResolution` / catalog metadata is the Kimarite layer. Current production battle behavior and diagnostics output remain unchanged.

`controlPhaseAdapter.ts` is diagnostic-only vocabulary glue. It converts `ControlPhasePredecessor` (`BoutEngagement.phase`) into a conservative `ControlPhaseCandidate` without sampling engagement, changing route bias, or treating the predecessor enum as the ideal ControlPhase enum. Direct mappings are limited to exact shared vocabulary, `EDGE_SCRAMBLE` is renamed to `EDGE_BATTLE`, and `MIXED` is marked ambiguous unless existing finish-route / kimarite-pattern evidence makes an inferred candidate readable.

Player PreBoutPhase snapshots are collected only through the opt-in diagnostics collector in `simulation/diagnostics.ts`. The collector records deterministic weights and reason tags only; it does not sample a phase with production RNG and must not add fields to `calculateBattleResult`, `PlayerBoutDetail`, persistence rows, worker protocol, App, or UI.

Diagnostics that already join phase, route, engagement, or kimarite may emit additive `boutFlow` fields alongside legacy JSON fields. These fields are report vocabulary only and must not become production payloads without a separate protocol task.

Current BoutFlow diagnostics coverage:

- OpeningPhase is covered by synthetic and player PreBoutPhase collectors through dominant weights and reason tags.
- ControlPhasePredecessor / ControlPhaseCandidate is still weak: only the route-bias harness currently emits both; broader player explanation diagnostics do not yet expose engagement.
- FinishRoute is covered wherever legacy `winRoute` is already collected. `resolveFinishRoute` is the shared selector for production and the route-bias harness; diagnostics pass `routeMultipliers` only in explicit ENABLED harness mode.
- Kimarite is covered in player explanation, contradiction, and route-bias diagnostics when catalog metadata is available; opening-only collectors intentionally omit it.

`preBoutPhaseRouteBias.ts` remains diagnostic / experiment infrastructure. Direct PreBoutPhase-to-route bias is not a production candidate by itself; any live behavior change must go through a separate flow-level design and validation task.

Player BoutExplanation snapshots are also diagnostics-only. They assemble broad factor labels from already-computed player bout values after the result and kimarite are known. They must not expose raw coefficients, consume RNG, alter result/route/kimarite selection, or become persistence/UI fields without a separate contract task.

The profile is diagnostic infrastructure only in this phase. Production player and NPC bout outcomes must not route through it until a compatibility wrapper proves identical `resolveBoutWinProb` inputs and RNG order.
