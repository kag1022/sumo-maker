# logic/calibration

校正データと型定義。番付移動は `sumo-api-db` 長期データ由来を既定とし、
career / population / NPC realism は既存の平成系 calibration を使います。

- `banzukeLongRange.ts` 番付分布の校正（既定）
- `banzukeHeisei.ts` 番付分布の旧校正（A/B 診断用）
- `banzukeProfile.ts` 番付 calibration source の意味論・coverage・runtime 選択 facade
- `npcRealismHeisei.ts` NPC 側 realism 校正
- `populationHeisei.ts` 母集団分布
- `types.ts` 校正データの型

番付 runtime は `banzukeProfile.ts` 経由で calibration を参照します。`divisionMovementQuantiles`
は「同部門残留 / 部門越境昇進 / 部門越境降下」の意味論を持つ source だけを runtime fallback に使います。
