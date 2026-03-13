# sumo-maker2

Web ブラウザで動く大相撲キャリアシミュレーションです。  
プレイヤーは新弟子の初期条件を設計し、その後の相撲人生を観測し、記録を読む立場に徹します。

React + TypeScript + Vite で UI を構成し、相撲ロジックは `src/logic` に分離しています。

## このゲームの軸

- 主体験は「操作」ではなく `設計 -> シミュレーション -> 記録読解`
- 番付・昇降格・取組・引退は、履歴に説得力を持たせるための基盤
- 横綱到達だけでなく、停滞・再浮上・負け越し続きのキャリアにも価値を持たせる
- UI は日本語中心、和の空気感とレトロゲーム文脈を両立する

## 現在の主な機能

- 新弟子作成
  - 四股名、入門経歴、体格、型の素地、所属一門と部屋を設定
  - 初期素質、キャリア帯、体格、特性を内部ロジックへ反映
- フルキャリアシミュレーション
  - 年 6 場所を進行
  - 勝敗、怪我、能力更新、番付編成、三賞、優勝、引退を処理
- レポート閲覧
  - 通算成績、番付推移、年表、決まり手傾向、怪我履歴、殿堂入り情報を表示
- Logic Lab
  - 固定 seed と preset で同一キャリアを再現
  - realism 向け preset を GUI から追跡
- 保存
  - IndexedDB（Dexie）へキャリアと付随ログを保存
  - 現行 DB 名は `sumo-maker-v13`

## 画面の見方

- `ホーム`
  - 新規開始、続きから、殿堂入り導線
- `力士作成`
  - 人物像と初期条件を決める
- `シミュレーション`
  - 途中介入せず、節目ログを観測する
- `レポート`
  - 人生要約、番付推移、勝敗履歴、怪我、決まり手、実績を読む
- `Logic Lab`
  - 開発用。preset + seed + model で検証する

## セットアップ

```bash
npm install
npm run dev
```

ブラウザで Vite の開発サーバーを開いてください。

## 開発コマンド

```bash
npm run dev
npm test
npm run build
npm run report:banzuke:quick
npm run report:banzuke:quantile
npm run report:realism:quick
npm run report:realism:retire
npm run report:realism:aptitude
npm run report:realism:acceptance
```

補足:

- `npm test`
  - `scripts/tests/index.ts` を入口に sim tests を実行
  - `scripts/shared/ensure_simtests_build.cjs` で `.tmp/sim-tests` を再利用
- `npm run report:realism:quick`
  - candidate 単独の quick realism probe
- `npm run report:realism:retire`
  - 引退と寿命の quick probe
- `npm run report:realism:aptitude`
  - C/D 校正用 ladder probe
- `npm run report:realism:acceptance`
  - v3 の最終 acceptance 用 Monte Carlo
- `npm run report:realism:mc`
  - 旧互換。v2/v3 compare acceptance
- `npm run report:realism:mc:v3`
  - 旧互換。v3 acceptance

## テスト運用

sim tests は scope 単位で絞れます。

```bash
node scripts/tests/run_sim_tests.cjs --list-scopes
node scripts/tests/run_sim_tests.cjs --scope retirement --jobs 1
node scripts/tests/run_sim_tests.cjs --scope rating --jobs 1
node scripts/tests/run_sim_tests.cjs --grep yokozuna
```

ポイント:

- `--scope` と `--grep` を併用可能
- `--jobs N` で scope 並列数を指定
- 既定では CPU 数に応じて自動並列
- tests は module registry 化されているが、命名規約 `scope: detail` は維持

現在の test 配置:

- `scripts/tests/modules/banzuke.ts`
- `scripts/tests/modules/simulation.ts`
- `scripts/tests/modules/gameplay.ts`
- `scripts/tests/modules/persistence.ts`
- `scripts/tests/modules/npc.ts`
- `scripts/tests/legacy/allCases.ts`

`legacy/allCases.ts` は既存ケース群の温存層です。新規テストは module 側へ追加してください。

## リアリズム検証フロー

日々の調整では、重い Monte Carlo を常用しません。

推奨フロー:

1. `npm test -- --scope <関連scope>`
2. `npm run report:realism:quick`
3. `npm run report:realism:retire`
4. 必要時のみ `npm run report:realism:aptitude`
5. 最終確認だけ `npm run report:realism:acceptance`

出力先:

- Markdown: `docs/balance/`
- JSON: `.tmp/`

quick 系レポートは `target / actual / pass-fail` 形式、acceptance は詳細レポートです。

## ディレクトリの考え方

```text
src/app              アプリ全体の画面構成
src/features         機能単位の UI / state / worker
src/logic            UI 非依存の相撲ドメインロジック
scripts/tests        決定論テストと runner
scripts/reports      分布確認・分析レポート
scripts/shared       scripts 間で共有する補助ロジック
docs/balance         人手で読むレポート
.tmp                 再生成可能な一時生成物
```

## アーキテクチャ要点

- `src/logic/simulation/engine`
  - 1 場所単位の進行エンジン
- `src/features/simulation/workers/simulation.worker.ts`
  - キャリア進行を worker 側で処理
- `src/logic/banzuke`
  - 番付編成、昇降格、委員会ロジック
- `src/logic/simulation/torikumi`
  - 取組編成
- `src/logic/battle.ts`
  - 勝敗判定
- `src/logic/simulation/strength`
  - 能力更新、平均回帰、期待勝数差の反映
- `src/logic/simulation/retirement`
  - 引退判定
- `src/logic/simulation/realism.ts`
  - aptitude profile、career band、stagnation、realism KPI
- `src/logic/persistence/repository.ts`
  - 永続化

## モデルと検証

現行の主対象モデル:

- `unified-v3-variance`

比較用モデル:

- `unified-v2-kimarite`

Logic Lab preset:

- `RANDOM_BASELINE`
- `LOW_TALENT_CD`
- `STANDARD_B_GRINDER`
- `HIGH_TALENT_AS`

realism の主要 KPI:

- `careerWinRate`
- `nonSekitoriCareerWinRate`
- `losingCareerRate`
- `careerWinRateLe35Rate`
- `careerWinRateLe30Rate`
- `allCareerRetireAgeP50`
- `nonSekitoriMedianBasho`

## 保存互換について

- 保存互換は強く維持していません
- 現在は `sumo-maker-v13`
- 旧 save との非互換があり得るため、ロジック更新時に DB 名を更新する方針です

## 注意点

- `npm run build` では chunk size warning が出ることがありますが、現状は build failure ではありません
- Monte Carlo は時間がかかるため、日常調整では quick probe を優先してください
- `progress.md` は作業ログであり、README には要点だけを載せています

## ライセンス

公開条件が未整理のため、現時点では明示していません。
