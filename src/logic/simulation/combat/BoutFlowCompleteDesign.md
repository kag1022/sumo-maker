# BoutFlowModel / BoutExplanation Complete Design

## Audit Summary

Current production bout resolution is not a complete causal explanation model.

- `src/logic/battle.ts` owns the player bout path. It computes player probability, rolls the result, then samples `BoutEngagement`, `FinishRoute`, and `KimariteOutcomeResolution`. The current `BoutExplanation` snapshot is collector-only and is emitted after result resolution.
- `src/logic/kimarite/engagement.ts` is the strongest existing bridge between result and content. It samples the post-result control shape from winner/loser style, stats, body, pressure, and dominance, then biases route and kimarite fit.
- `src/logic/kimarite/finishRoute.ts` selects `WinRoute` from O(1) weighted candidates. It already exposes `resolveFinishRouteCandidates` for diagnostics and keeps production RNG to one route roll.
- `src/logic/kimarite/selection.ts` selects the actual kimarite through route, pattern, catalog metadata, repertoire, rarity, body fit, style fit, and history. This is content-rich, but it is still a selector, not a narrative contract.
- `src/logic/simulation/combat/preBoutPhase.ts` derives deterministic opening weights. It is diagnostic-only and must not consume production RNG.
- `src/logic/simulation/combat/controlPhaseAdapter.ts` maps `BoutEngagement.phase` into a conservative `ControlPhaseCandidate`. It correctly keeps predecessor and candidate separate.
- `src/logic/simulation/combat/boutFlowDiagnosticSnapshot.ts` composes a report-only `OpeningPhase -> ControlPhaseCandidate -> FinishRoute -> Kimarite` snapshot. It did not previously expose which explanation axes were still missing.

The key gap is not route or kimarite variety. The gap is ownership of a single completed explanation object that joins opening, control, transition, finish, selected kimarite, broad victory factors, hoshitori context, and banzuke context without pretending exact hidden coefficients are player-facing facts.

## Complete Contract

The complete model is `BoutFlowModel` version `BOUT_FLOW_COMPLETE_CONTRACT_V1`.

Required layers for a complete explanation:

- `opening`: deterministic or sampled opening phase, phase weights, confidence, and reason tags.
- `control`: post-opening control state, predecessor engagement, candidate control phase, confidence, and reason tags.
- `transition`: whether the bout stayed aligned, shifted control, converted to technique, turned at the edge, or ended quickly.
- `finish`: abstract finish route, such as push out, belt force, throw break, pull down, edge reversal, rear finish, or leg attack.
- `kimarite`: actual selected kimarite plus pattern, family, rarity, and catalog status.
- `context`: hoshitori tags, banzuke tags, and pressure tags.
- `meaning`: winner role, broad victory factors, meaning tags, and material keys.
- `materials`: reusable explanation素材 selected by axis, subject, tone, required tags, and excluded tags.

This keeps the selector graph and the explanation graph separate. The selector graph can remain O(1) and fixed-RNG; the explanation graph reads already produced values and chooses deterministic materials.

## Explanation Material System

Materials are not one-off prose templates. Each material is tagged by axis:

- `OPENING`: 立合い、押し合い、四つ、技の探り合い、早い崩れ。
- `CONTROL`: 主導権、まわし、押し込み、差し手、土俵際、半身。
- `TRANSITION`: 初期想定からの転換、土俵際の反転、技への変換、即決。
- `FINISH_ROUTE`: 抽象勝ち筋。`WinRoute` を player-facing に言い換える。
- `KIMARITE`: 決まり手そのものと catalog family / rarity / pattern。
- `VICTORY_FACTOR`: 能力、型、体格、調子、勢い、怪我、圧力、技適合。
- `HOSHITORI_CONTEXT`: 勝ち越し、負け越し、優勝争い、連勝/連敗、場所終盤。
- `BANZUKE_CONTEXT`: 昇進、降下、関取境界、幕内境界、番付差、金星。
- `OUTCOME_MEANING`: この一番がキャリア・場所の記録として持つ意味。

Material selection must be deterministic and bounded: filter by tags, sort by stable priority, choose the first acceptable variant or a stable hash variant that does not consume production RNG.

## Responsibility Boundary

- `battle.ts`: may assemble a completed explanation only after outcome, route, and kimarite are known. It must not change result roll, route selection, kimarite selection, return shape, or RNG order.
- `preBoutPhase.ts`: owns deterministic opening weights only. It does not decide live route.
- `engagement.ts`: owns production post-result engagement sampling. It remains a selector predecessor, not the full ControlPhase contract.
- `controlPhaseAdapter.ts`: owns diagnostic vocabulary conversion from engagement to ControlPhase candidate.
- `finishRoute.ts`: owns abstract finish route candidates and production route roll.
- `selection.ts`: owns kimarite selection and catalog fit.
- `diagnostics.ts`: owns opt-in collectors only. No persistence, worker protocol, App/UI, or DB schema fields.
- future `boutExplanation.ts`: should own deterministic material selection and completed explanation assembly once all context inputs are available.

## Diagnostics

The diagnostic snapshot now reports explanation-axis coverage:

- `explanationCoverage`: each axis is `AVAILABLE`, `PARTIAL`, or `MISSING`.
- `missingExplanationAxes`: exact axes that prevent complete explanation.
- `explanationCompleteness`: `FLOW_ONLY`, `FLOW_AND_RESULT`, or `COMPLETE_CONTEXT`.

`boutFlowDiagnosticBuilder.ts` derives the first production-safe diagnostic tags from `BoutExplanationSnapshot`:

- `victoryFactorTags` from broad explanation factors.
- `hoshitoriContextTags` from bout ordinal, pressure flags, score, streak, previous result, and title implication.
- `banzukeContextTags` from rank/division, promotion or demotion pressure, kinboshi context, and ordinary rank expectation fallback.

`boutFlowCommentary.ts` consumes only `COMPLETE_CONTEXT` snapshots and returns a runtime-only commentary contract:

- `shortCommentary`: a compact bout note keyed by kimarite plus transition and context.
- `victoryFactorLabels`: player-readable broad labels derived from diagnostic factor tags.
- `flowExplanation`: deterministic Opening / Control / Transition / Finish / Kimarite / 星取 / 番付 explanation lines.
- `materialKeys`: stable material identifiers for coverage reports and future UI review.

This is still diagnostic-only. It reads values that already exist after result resolution and does not consume RNG or change selector inputs.

Useful acceptance diagnostics:

- BoutFlow coverage available for every collected player explanation snapshot that has weights, route, engagement, and kimarite.
- `AMBIGUOUS_CONTROL` rate is tracked separately from hard contradictions.
- `missingExplanationAxes` trends down as context contracts are added.
- Same kimarite can appear across multiple transition classifications and hoshitori/banzuke tags.
- No diagnostic collector changes production `calculateBattleResult` result shape or RNG call count.
- `scripts/diagnostics/bout_flow_commentary_generator.ts` confirms that the same kimarite yields different short commentary and material keys when Opening / Control / Transition / 星取 / 番付 context changes.

## Acceptance Conditions

Complete behavior is acceptable only when all conditions hold:

- One bout remains O(1): no Monte Carlo, no search, no physics simulation, no candidate expansion dependent on roster size.
- Production win probability, result roll, engagement sampling, route selection, kimarite selection, DB schema, worker protocol, and UI remain unchanged until a separate behavior task explicitly changes them.
- A fixed-seed player bout produces identical battle result and identical production RNG call count with and without explanation diagnostics.
- Explanation never exposes raw coefficients or hidden logits as player-facing facts.
- Diagnostic reports can group explanations by opening, control, transition, finish route, kimarite family, hoshitori context, banzuke context, and missing axis.
- Same kimarite has multiple deterministic explanation paths when flow/context differs.

## Roadmap

1. Contract layer: expand `BoutFlowModel` and diagnostic coverage without touching production behavior.
2. Context extraction: add deterministic hoshitori and banzuke tag builders from existing `BoutContext` / rank context.
3. Factor normalization: move broad victory factor assembly out of `battle.ts` into a pure helper that consumes already-computed values.
4. Material catalog: add axis-tagged explanation素材 with stable deterministic selection.
5. Completed runtime-only `BoutExplanation`: assemble `BoutFlowModel + materials + short/medium explanation drafts` behind the opt-in collector.
6. Diagnostics: update reports to show completeness, contradiction rates, repeated kimarite by flow, and context diversity.
7. Production exposure decision: only after fixed-seed and report acceptance, decide whether a worker/UI contract is worth adding. This is intentionally not part of this step.
