# simulation/combat

Readonly combat profile contracts for future bout-kernel work.

`kernel.ts` is the minimal shared combat kernel boundary. It is a pure thin wrapper around `resolveBoutWinProb`: callers must pass already-normalized ability, style, injury, bonus, and optional soft-cap values. Source labels and metadata are diagnostic only and must not affect probability.

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

The profile is diagnostic infrastructure only in this phase. Production player and NPC bout outcomes must not route through it until a compatibility wrapper proves identical `resolveBoutWinProb` inputs and RNG order.
