# logic/calibration

校正データと型定義。番付移動は `sumo-api-db` 長期データ由来を既定とし、
career / population / NPC realism は既存の平成系 calibration を使います。

- `banzukeLongRange.ts` 番付分布の校正（既定）
- `banzukeHeisei.ts` 番付分布の旧校正（A/B 診断用）
- `npcRealismHeisei.ts` NPC 側 realism 校正
- `populationHeisei.ts` 母集団分布
- `types.ts` 校正データの型
