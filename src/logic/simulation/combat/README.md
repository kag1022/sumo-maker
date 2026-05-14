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

`playerCompat.ts` is the player-bout compatibility boundary. It currently normalizes and forwards the existing `calculateBattleResult` inputs to the legacy player battle resolver without changing formulas or RNG order. The returned player bout result may carry a deterministic `BoutFlowCommentary` summary generated after result / route / kimarite selection has already completed.

`npcCompat.ts` is the NPC-bout compatibility boundary behind `simulateNpcBout`. It stages the existing NPC flow into branch classification, fought-bout probability input construction, fought-bout metric mutation, result roll, and record mutation. It must preserve the normal-path RNG order (`aNoise`, `bNoise`, result roll), probability inputs, fusen/no-contest behavior, and mutation order.

`preBoutPhase.ts` derives inspectable PreBoutPhase weights from already-available combat descriptors. Player bout commentary now also uses those deterministic weights as OpeningPhase evidence, but the module still must not sample a phase, consume RNG, or affect win probability / result / route / kimarite selection.

`boutFlowModel.ts` defines the complete future vocabulary for reading one bout as `OpeningPhase -> ControlPhase -> Transition -> FinishRoute -> Kimarite -> 勝敗要因 -> 星取文脈 -> 番付文脈`. It is a contract-only layer: current `PreBoutPhase` is the OpeningPhase predecessor, `BoutEngagement` / `EngagementPhase` is the ControlPhase predecessor, `WinRoute` is the FinishRoute predecessor, and `KimariteOutcomeResolution` / catalog metadata is the Kimarite layer. Current production battle behavior remains unchanged.

`controlPhaseAdapter.ts` is diagnostic-only vocabulary glue. It converts `ControlPhasePredecessor` (`BoutEngagement.phase`) into a conservative `ControlPhaseCandidate` without sampling engagement, changing route bias, or treating the predecessor enum as the ideal ControlPhase enum. Direct mappings are limited to exact shared vocabulary, `EDGE_SCRAMBLE` is renamed to `EDGE_BATTLE`, and `MIXED` is marked ambiguous unless existing finish-route / kimarite-pattern evidence makes an inferred candidate readable.

`boutFlowDiagnosticSnapshot.ts` composes a snapshot for reading `OpeningPhase -> ControlPhaseCandidate -> FinishRoute -> Kimarite` as one flow. It adds opening/control confidence, transition classification, and explanation-axis coverage (`FLOW_ONLY` / `FLOW_AND_RESULT` / `COMPLETE_CONTEXT`). Fixed-seed diagnostics still use it directly; production player bouts may also pass a completed snapshot into the commentary contract after battle resolution.

`boutFlowDiagnosticBuilder.ts` is the pure bridge from existing `BoutExplanationSnapshot` data to a completed diagnostic flow snapshot. It derives victory-factor tags, hoshitori context tags, and banzuke context tags from already-computed values only. It does not inspect route weights, kimarite candidate weights, or consume RNG.

`boutFlowCommentary.ts` is the commentary contract for complete diagnostic snapshots. It accepts only `BoutFlowDiagnosticSnapshot` values whose completeness is `COMPLETE_CONTEXT` and deterministically returns short commentary, victory-factor labels, flow explanation lines, material keys, and the player outcome (`WIN` / `LOSS`). Production player bouts use this only after win probability, result roll, engagement sampling, finish route, and kimarite selection have already completed; it does not consume RNG or feed back into selectors.

The complete design note is `BoutFlowCompleteDesign.md`. It defines the required type surface, explanation素材 axes, diagnostic indicators, acceptance conditions, and implementation roadmap before this model is allowed to become player-facing.

`PlayerBoutExplanationPreviewDesign.md` records the earlier preview audit. The current throughline stores player-only `BoutFlowCommentary` on `PlayerBoutDetail` / `BoutRecordRow` and `BashoDetailModal` / `DockedBashoDetailPane` render it in the selected player bout detail panel. The dev preview injection path remains useful for fixed-seed UI checks, but saved player bout commentary is now the primary source when present.

Player PreBoutPhase snapshots are collected only through the opt-in diagnostics collector in `simulation/diagnostics.ts`. The collector records deterministic weights and reason tags only; it does not sample a phase with production RNG. Separately, player bout commentary uses the same deterministic weights inside the production result object and persisted player bout row.

Diagnostics that already join phase, route, engagement, or kimarite may emit additive `boutFlow` fields alongside legacy JSON fields. These fields are report vocabulary only and must not become production payloads without a separate protocol task.

Current BoutFlow diagnostics coverage:

- OpeningPhase is covered by synthetic and player PreBoutPhase collectors through dominant weights and reason tags.
- ControlPhasePredecessor / ControlPhaseCandidate is still diagnostic-only vocabulary. The route-bias harness emits synthetic snapshots, and the player explanation collector emits snapshots only from already-sampled engagement metadata.
- BoutFlow diagnostic snapshots are emitted by `prebout_phase_route_bias_harness` and `bout_explanation_player_collector`. The explanation collector uses the already-sampled post-outcome engagement from `battle.ts`; it must not resample engagement or alter the production route / kimarite path.
- FinishRoute is covered wherever legacy `winRoute` is already collected. `resolveFinishRoute` is the shared selector for production and the route-bias harness; diagnostics pass `routeMultipliers` only in explicit ENABLED harness mode.
- Kimarite is covered in player explanation, contradiction, and route-bias diagnostics when catalog metadata is available; opening-only collectors intentionally omit it.

`scripts/diagnostics/bout_flow_commentary_generator.ts` is an opt-in fixed-seed diagnostic generator for the commentary contract. It feeds synthetic `COMPLETE_CONTEXT` snapshots through `boutFlowCommentary.ts` and verifies that Opening / Control / Transition / Finish / Kimarite / 星取 / 番付 context changes produce different material keys and short commentary without touching production RNG or selectors. The report also audits Japanese prose guardrails, sumo-expression notes, material-key bias, duplicate short commentary, duplicate material text, and per-axis reflection.

`preBoutPhaseRouteBias.ts` remains diagnostic / experiment infrastructure. Direct PreBoutPhase-to-route bias is not a production candidate by itself; any live behavior change must go through a separate flow-level design and validation task.

Player BoutExplanation snapshots assemble broad factor labels from already-computed player bout values after the result and kimarite are known. When collectors are enabled, `battle.ts` still emits the legacy explanation and BoutFlow diagnostic snapshots. Independently, the same pure snapshot builder now produces player-only commentary for persistence/UI when the snapshot reaches `COMPLETE_CONTEXT`; it must not expose raw coefficients, consume RNG, or alter result/route/kimarite selection.

The profile is diagnostic infrastructure only in this phase. Production player and NPC bout outcomes must not route through it until a compatibility wrapper proves identical `resolveBoutWinProb` inputs and RNG order.
