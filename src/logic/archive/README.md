# logic/archive

保存済みキャリアを資料館・観測ビルドとして分類する純ロジックです。

- `types.ts` 観測テーマ、modifier、資料館カテゴリの型
- `observationThemes.ts` 観測テーマごとの bias 定義
- `observationBuild.ts` modifier の合成、cost、validation
- `applyObservationBuildBias.ts` scout で生成した初期状態への soft bias 適用
- `categories.ts`, `titles.ts`, `rewards.ts` 保存後の分類、称号、報酬判定

## 設計ルール

- 結果保証ではなく確率重みの補正だけを行う
- UI 文言や画面状態を持たない
- `logic` 内の生成・評価モデルを直接呼べる形に保つ
- bias を増やした場合は対応する tests か report を追加する
