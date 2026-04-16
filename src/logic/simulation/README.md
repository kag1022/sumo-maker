# logic/simulation

キャリア進行の中核エンジン。1 場所・1 番・1 年単位の進行をここで組み立てます。
`src/features/simulation/` の worker から呼ばれます。

## サブディレクトリ

| パス | 役割 |
|------|------|
| `engine/` | 場所単位の進行エンジン本体 |
| `torikumi/` | 取組編成 |
| `strength/` | 能力更新・平均回帰・期待勝数差の反映 |
| `retirement/` | 引退判定 |
| `matchmaking/` | 組合せロジック（engine 前段） |
| `actors/` | キャリア主体のライフサイクル |
| `basho/` | 場所単体の状態 |
| `boundary/` | 境界処理 |
| `heya/` | 部屋レベルの集計 |
| `lower/`, `sekitori/`, `topDivision/` | 階層別の進行 |
| `npc/` | NPC 挙動 |
| `variance/` | 分散モデル（`unified-v3-variance` など） |
| `world/` | 並列キャリアを包含する世界状態 |
| `diagnostics/` | 進行中の内部診断 |

## 重要ファイル

| ファイル | 内容 |
|----------|------|
| `runner.ts` | 進行ランナー（hook / worker からのエントリ） |
| `appFlow.ts` | アプリ側が触るフロー API |
| `realism.ts` | aptitude profile / career band / stagnation / realism KPI |
| `playerRealism.ts` | プレイヤー側の realism チェック |
| `injury.ts` | 怪我処理 |
| `modelVersion.ts` | model 識別 |
| `workerProtocol.ts` | UI ↔ worker のメッセージ契約 |
| `deps.ts` | 依存注入口 |

## テスト

- `scripts/tests/modules/simulation.ts`
- `scripts/tests/current/simulation.ts`

## 注意

- この層は副作用を持たず純粋関数に近いこと。永続化は `src/logic/persistence/` に委譲します。
- 重い Monte Carlo は常用せず、日常は quick probe（`npm run report:realism:quick`）で回します。
