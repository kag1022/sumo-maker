# features/observationBuild

観測テーマと modifier を選び、初期生成に soft bias をかけてキャリアを観測する画面です。

- `ObservationBuildScreen.tsx` テーマ選択、所属環境、modifier 選択、cost 表示、開始導線

## 設計ルール

- bias の定義と合成は `src/logic/archive/` に置く
- 所属環境は 45 部屋を直接選ばせず、`src/logic/simulation/heya/` の部屋系統から既存 `stableId` へ解決する
- 画面は選択状態と説明表示だけを担当し、結果保証のような文言を出さない
- 本編 scout と同じ初期生成導線を使い、観測ビルド専用の別モデルを作らない
