# logic/era

実データ由来の匿名 EraSnapshot を扱う層です。

- `types.ts` はゲーム本体で使う EraSnapshot 契約を定義する
- `eraSnapshot.ts` は生成済み JSON の読み込み、ID 解決、開始時ランダム選択を提供する
- `eraTags.ts` は UI 表示向けの控えめな日本語ラベルを提供する
- `data/era_snapshots_196007_202603.json` はゲーム同梱の匿名集計データ

## 方針

- 実名、実四股名、個人 ID はこのディレクトリの同梱 JSON に入れない
- UI は `publicEraLabel` と `eraTags` だけを表示し、`sourceBashoKey` は通常表示しない
- NPC 世界生成では EraSnapshot を構造入力として使い、実在人物の個別キャリアを再現しない
