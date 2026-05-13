# features/observationBuild

観測テーマと modifier を選び、初期生成に soft bias をかけてキャリアを観測する画面です。

- `ObservationBuildScreen.tsx` テーマ選択、modifier 選択、cost 表示、開始導線

## 設計ルール

- bias の定義と合成は `src/logic/archive/` に置く
- 画面は選択状態と説明表示だけを担当し、結果保証のような文言を出さない
- 本編 scout と同じ初期生成導線を使い、観測ビルド専用の別モデルを作らない
