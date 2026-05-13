# logic/simulation

キャリア進行の中核エンジンです。`src/features/simulation/` の worker / store はこの層の
runtime API を唯一の入口として使います。

## 現在の中核レイヤ

| レイヤ | 役割 |
|------|------|
| `runtime.ts` | Simulation Application Layer。`createSimulationRuntime`, `runSeasonStep`, `resumeRuntime`, `serializeRuntime` を公開する |
| `engine/runOneStep.ts`, `engine/seasonPhases.ts` | Season Orchestrator。1 場所進行の phase 実行だけを担当する |
| `leagueFlow.ts`, `leagueState.ts`, `world/`, `lowerQuota.ts`, `sekitoriQuota.ts` | League Runtime の土台。world 群を実装詳細としてまとめ、`LeagueState` snapshot へ集約する |
| `careerDynamics.ts`, `careerMilestones.ts` | Career Dynamics。`TrajectoryProfile`, `ArcState`, `DomainEvent` と節目記録を組み立てる |
| `runtimeNarrative.ts` | Narrative & Diagnostics。章判定、観測ログ、pause 判定を worker から分離して扱う |
| `observation/` | 長期観測 API。Monte Carlo / probe / verification の正式入口 |
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
| `npc/tsukedashi.ts` | 年次の低頻度付出 NPC 計画と一場所限定の特殊表示管理 |
| `variance/` | 分散モデル（`unified-v3-variance` など） |
| `world/` | 並列キャリアを包含する世界状態 |
| `diagnostics/` | 進行中の内部診断 |
| `observation/` | 長期観測 summary と batch 集計 |

## 重要ファイル

| ファイル | 内容 |
|----------|------|
| `runtime.ts` | runtime API。feature / worker / scripts はここから始める |
| `runtimeTypes.ts` | `SimulationRuntime`, `LeagueState`, `TrajectoryProfile`, `ArcState`, `DomainEvent` などの契約 |
| `leagueFlow.ts` | tests / reports / engine が共有する league flow API |
| `leagueState.ts` | `LeagueFlowRuntime` から rank / headcount / vacancy snapshot を組み立てる唯一の builder |
| `careerDynamics.ts` | キャリア位相と domain event の一元生成 |
| `careerMilestones.ts` | 優勝、初関取、陥落、怪我、停滞脱出などの節目記録を生成する |
| `runtimeNarrative.ts` | chaptered / observe 表示向けの章・観測ログ・pause 判定 |
| `liveBashoView.ts` | worker payload 向けの場所観測 view model builder。React / feature 非依存 |
| `observation/index.ts` | 長期観測 API。report / probe / verification の正式入口 |
| `modelBundle.ts` | model version から `SimulationModelBundle` を解決する |
| `engine/seasonPhases.ts` | preseason / promotion / attrition の league phase を分離する |
| `runner.ts` | scripts 向けの簡易ランナー |
| `realism.ts` | aptitude profile / career band / stagnation / realism KPI |
| `playerRealism.ts` | プレイヤー側の realism チェック。下位停滞、上位圧縮、期待勝数補正を持つ |
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
- `runCareerObservation()` / `runObservationBatch()` / `summarizeObservationBatch()` 長期観測 API

## 設計ルール

- feature / worker / scripts は `runtime.ts` か `runner.ts` を入口にする
- tests / reports の長期分布観測は `observation/` を入口にする
- `LeagueState` を rank / headcount / vacancy の source of truth として扱う
- `LeagueState` の組み立ては `leagueState.ts` に集約し、`runtime.ts` に world 走査を戻さない
- 場所ごとの可変 headcount は `scaleSlots` として banzuke に渡し、表示 rank label と内部 rankIndex を分けて扱う
- 下位番付の成績移動、新弟子流入圧、空き圧、境界投影は banzuke decision log の診断値として観測・report へ渡す
- `DomainEvent` を narrative / report / logic lab の共有語彙とする
- worker は章判定や観測文言を直接所有せず、`runtimeNarrative.ts` の結果を protocol に詰める
- orchestration 層に係数や policy 判定を追加しない
- 下位定着・関取定着・幕内上位の realism 係数は `playerRealism.ts` と `retirement/` に閉じ込める
- population 調整と promotion 判定を同じ関数に混ぜない
- 付出 NPC は population plan で年次計画し、`reconcile` の不足補充では発生させない
- `world`, `runOneStep`, `lowerQuota`, `sekitoriQuota` を report worker から直接 import しない

## テスト

- `scripts/tests/modules/simulation.ts`
- `scripts/tests/current/simulation.ts`

## バランス確認

- 日常確認は `npm run report:realism:quick` を優先する
- 平成実データとの直接比較は `npm run predict:diagnose` で確認する
- quick report は 500 件前後の標本で低頻度 rank も見るため、横綱率などの希少指標は絶対許容幅も併用する
- 昇進率、非関取勝率、負け越しキャリア率、決まり手多様性は同じ report で同時に見る
- 係数変更後に 1 指標だけを直すのではなく、career band、成長、引退、取口の連動を確認する
- NPC の引退分布を見るときは、観測フレーム上の出現回数ではなく `careerBashoCount` を使う

## 注意

- 永続化は `src/logic/persistence/` に委譲する
- worker 契約変更時は `src/features/simulation/` と同時に更新する
- 重い Monte Carlo は常用せず、日常は quick probe（`npm run report:realism:quick`）で回す
- 長期観測の詳細確認は `npm run report:realism:full` を使う
