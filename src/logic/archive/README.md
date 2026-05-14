# logic/archive

観測テーマと読み口調整を初期生成へ反映する純ロジックです。

- `types.ts` 観測テーマ、modifier、bias 定義の型
- `observationThemes.ts` 観測テーマごとの bias 定義
- `observationBuild.ts` modifier の合成、cost、validation
- `applyObservationBuildBias.ts` scout で生成した初期状態への soft bias 適用

## 設計ルール

- 結果保証ではなく確率重みの補正だけを行う
- UI 文言や画面状態を持たない
- `logic` 内の生成・評価モデルを直接呼べる形に保つ
- bias を増やした場合は対応する tests か report を追加する
