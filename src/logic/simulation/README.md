# logic/simulation

キャリア進行の中核エンジンです。`src/features/simulation/` の worker / store はこの層の
runtime API を唯一の入口として使います。

## 現在の中核レイヤ

| レイヤ | 役割 |
|------|------|
| `runtime.ts` | Simulation Application Layer。`createSimulationRuntime`, `runSeasonStep`, `resumeRuntime`, `serializeRuntime` を公開する |
| `engine/runOneStep.ts`, `engine/seasonPhases.ts` | Season Orchestrator。1 場所進行の phase 実行だけを担当する |
| `leagueFlow.ts`, `world/`, `lowerQuota.ts`, `sekitoriQuota.ts` | League Runtime の土台。world 群を実装詳細としてまとめ、runtime snapshot へ集約する |
| `careerDynamics.ts` | Career Dynamics。`TrajectoryProfile`, `ArcState`, `DomainEvent` を組み立てる |
| `workerProtocol.ts` | worker 契約。`SEASON_STEP` / `RUNTIME_COMPLETED` を返す |

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
| `runtime.ts` | runtime API。feature / worker / scripts はここから始める |
| `runtimeTypes.ts` | `SimulationRuntime`, `LeagueState`, `TrajectoryProfile`, `ArcState`, `DomainEvent` などの契約 |
| `leagueFlow.ts` | tests / reports / engine が共有する league flow API |
| `careerDynamics.ts` | キャリア位相と domain event の一元生成 |
| `modelBundle.ts` | model version から `SimulationModelBundle` を解決する |
| `engine/seasonPhases.ts` | preseason / promotion / attrition の league phase を分離する |
| `runner.ts` | scripts 向けの簡易ランナー |
| `realism.ts` | aptitude profile / career band / stagnation / realism KPI |
| `playerRealism.ts` | プレイヤー側の realism チェック |
| `injury.ts` | 怪我処理 |
| `modelVersion.ts` | model version 正規化 |
| `workerProtocol.ts` | UI ↔ worker のメッセージ契約 |
| `deps.ts` | 依存注入口 |

## 公開 API

- `createSimulationRuntime()` 新規 runtime 構築
- `runSeasonStep()` 1 場所進行
- `resumeRuntime()` serialize 済み runtime の再開
- `serializeRuntime()` runtime 状態の書き出し
- `createLeagueFlowRuntime()` league flow の構築
- `prepareLeagueForBasho()` / `applyLeaguePromotionFlow()` / `advanceLeaguePopulation()` league flow の正式入口
- `resolveSimulationModelBundle()` model bundle の解決

## 設計ルール

- feature / worker / scripts は `runtime.ts` か `runner.ts` を入口にする
- tests / reports が population を回すときは `leagueFlow.ts` を入口にする
- `LeagueState` を rank / headcount / vacancy の source of truth として扱う
- `DomainEvent` を narrative / report / logic lab の共有語彙とする
- orchestration 層に係数や policy 判定を追加しない
- population 調整と promotion 判定を同じ関数に混ぜない

## テスト

- `scripts/tests/modules/simulation.ts`
- `scripts/tests/current/simulation.ts`

## 注意

- 永続化は `src/logic/persistence/` に委譲する
- worker 契約変更時は `src/features/simulation/` と同時に更新する
- 重い Monte Carlo は常用せず、日常は quick probe（`npm run report:realism:quick`）で回す
