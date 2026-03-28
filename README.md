# sumo-maker2

Web ブラウザで動く大相撲キャリアシミュレーションです。  
本格的な相撲ロジックで力士の一生を再現し、その記録を読む観測ゲームとして設計しています。

React + TypeScript + Vite で UI を構成し、相撲ロジックは `src/logic` に分離しています。

## このゲームは何か

- 新弟子の出自と素地を設計し、その後の相撲人生を記録として読むゲームです。
- 日々の育成管理を繰り返すゲームではありません。
- 強い力士だけでなく、印象に残る人生や希少な記録にも保存する価値があります。

プレイヤーは土俵の外から力士を操作するのではなく、入門時点の条件を与えたうえで、その後の一生を読み解く立場に徹します。  
番付、昇降格、怪我、取組、引退といった相撲制度の積み重ねが、結果として現れる記録に説得力を与えます。

## コア体験ループ

1. 新弟子の出自と素地を設計する
2. フルキャリアを即座にシミュレートする
3. `力士記録` で、その力士がどんな一生を送ったかを読む
4. 保存するかどうかを読後に判断する
5. 別の人生を見たくなったら、次の新弟子を設計する

### 体験原則

- プレイヤーに求める判断は `新弟子設計` に集約し、その後は読解に集中させる
- UI の快感は操作量ではなく、整理された記録から人物像が立ち上がることに置く
- 結果画面の初手は静かな表紙として設計し、詳細はモダンな力士データベースとして掘らせる
- 高位や好成績だけでなく、停滞、再浮上、宿敵、希少記録を含む人生全体に価値を置く
- 日本語中心の UI と和の空気感を維持しつつ、情報の読みやすさを最優先する

## 画面ごとの役割

以下ではコンセプト上の呼称を使います。現行 UI のラベルは括弧内に併記します。

- `新弟子設計`（現 UI: `スカウト`）
  - 四股名、出身地、入門年齢、身長、体重、学歴・競技歴、所属部屋、気質、身体の素地を決める
  - ここで決めるのは完成形ではなく、人生の出発点と伸び方の種
- `力士記録`（現 UI: `力士結果`）
  - 冒頭 1 画面では `四股名 / 出身地・部屋 / 最高位 / 通算成績` を静かに読む
  - 詳細では `プロフィール / 戦績 / 番付推移 / 対戦・宿敵` をタブで掘る
- `保存済み記録`（現 UI: `保存レコード`）
  - 見届けた人生を一覧し、あとから読み返せる保管庫
- `資料館`（現 UI: `力士コレクション`）
  - 珍しい記録や未発見要素を蓄積し、相撲世界の理解を深める場所

## 相撲ロジックの立ち位置

- 番付、昇降格、取組、怪我、引退は「管理すべきゲーム要素」ではなく、記録に説得力を与える基盤
- 本格感は用語の多さではなく、最終的に現れる人生の納得感として伝える
- リアリズムは表で誇示するより、`この結果ならありそうだ` と感じさせる形で効かせる

## 保存と資料館

- 保存はプレイの主目的ではなく、`読んだあとに残したくなるか` を判断する行為
- 保存価値は最高位や優勝回数だけでなく、希少な記録、浮沈、宿敵関係、印象に残る歩みからも生まれる
- `資料館` は単なる収集帳ではなく、自分が見届けた相撲人生の私設アーカイブとして位置づける

### 成功指標

- 1プレイが短く終わっても、1人の力士像が記憶に残ること
- `力士記録` の冒頭だけで、その人物の輪郭と最終到達点が分かること
- 詳細へ進むと、整理されたデータベースとして気持ちよく掘れること
- 戦績や番付推移だけでなく、対戦相手や転機まで含めて人物像が立ち上がること
- 強い力士を見たい欲求と、別の人生を読みたい欲求の両方が自然に次のプレイへつながること

## 現在の主な機能

- 新弟子設計
  - 四股名、入門経歴、体格、型の素地、所属部屋などを設定
  - 初期素質、キャリア帯、体格、特性を内部ロジックへ反映
- フルキャリアシミュレーション
  - 年 6 場所を進行
  - 勝敗、怪我、能力更新、番付編成、三賞、優勝、引退を処理
- 力士記録
  - 通算成績、番付推移、年表、決まり手傾向、怪我履歴、殿堂入り情報を表示
- Logic Lab
  - 固定 seed と preset で同一キャリアを再現
  - realism 向け preset を GUI から追跡
- 保存と資料館
  - IndexedDB（Dexie）へキャリアと付随ログを保存
  - 現行 DB 名は `sumo-maker-v13`

## 画面の見方

- `ホーム`
  - 新規開始、続きから、保存済み記録への導線
- `新弟子設計`（現 UI: `スカウト`）
  - 人物像と初期条件を決める
- `シミュレーション`
  - 途中介入せず、フルキャリアを演算する
- `力士記録`（現 UI: `力士結果`）
  - 人生要約、番付推移、勝敗履歴、対戦相手、怪我、実績を読む
- `保存済み記録`（現 UI: `保存レコード`）
  - 見届けた人生を一覧し、あとから読み返す
- `資料館`（現 UI: `力士コレクション`）
  - 保存した人生や解放済みの記録を読み返す
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
npm run test:verification
npm run test:docs
npm run build
npm run report:calibration
npm run report:banzuke:quick
npm run report:banzuke:quantile
npm run report:realism:quick
npm run report:realism:retire
npm run report:realism:aptitude
npm run report:realism:acceptance
```

補足:

- `npm test`
  - unit suite の sim tests を実行
  - `scripts/tests/index.ts` を入口に `--suite unit` で起動
  - `scripts/shared/ensure_simtests_build.cjs` で `.tmp/sim-tests` を再利用
- `npm run test:verification`
  - 校正 JSON や収集レポートの静的整合チェックを実行
- `npm run test:docs`
  - `docs/balance/` 配下の生成物が存在し、内容が期待に合うかを監査
- `npm run test:all`
  - `unit / verification / docs` をまとめて対象にする
- `npm run report:realism:quick`
  - candidate 単独の quick realism probe
- `npm run report:calibration`
  - `sumo-db` 由来の校正 JSON と要約 Markdown を再生成
  - 重い Monte Carlo は回さず、校正データの静的整合だけを更新
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

sim tests は suite と scope の両方で絞れます。

```bash
node scripts/tests/run_sim_tests.cjs --list-scopes
node scripts/tests/run_sim_tests.cjs --suite unit --scope retirement --workers 1
node scripts/tests/run_sim_tests.cjs --suite unit --scope rating --workers 1
node scripts/tests/run_sim_tests.cjs --suite unit --scope experience --workers 1
node scripts/tests/run_sim_tests.cjs --suite verification
node scripts/tests/run_sim_tests.cjs --suite docs --workers 1
node scripts/tests/run_sim_tests.cjs --grep yokozuna
```

ポイント:

- `npm test` は `--suite unit` の省略形
- `verification` は校正データの整合、`docs` は生成済み Markdown の監査
- `--scope` と `--grep` を併用可能
- `--suite unit|verification|docs|all` で対象スイートを切り替え可能
- `--workers N` で scope 並列数を指定
- `--jobs N` も互換のため残しているが、新規利用は `--workers` を優先
- 既定では CPU 数に応じて自動並列
- tests は module registry 化されているが、命名規約 `scope: detail` は維持

現在の test 配置:

- `scripts/tests/modules/banzuke.ts`
- `scripts/tests/modules/calibration.ts`
- `scripts/tests/modules/simulation.ts`
- `scripts/tests/modules/gameplay.ts`
- `scripts/tests/modules/experience.ts`
- `scripts/tests/modules/persistence.ts`
- `scripts/tests/modules/npc.ts`
- `scripts/tests/modules/ui.ts`
- `scripts/tests/current/index.ts`
- `scripts/tests/current/banzuke.ts`
- `scripts/tests/current/simulation.ts`
- `scripts/tests/current/gameplay.ts`
- `scripts/tests/current/persistence.ts`
- `scripts/tests/current/npc.ts`
- `scripts/tests/compat/index.ts`
- `scripts/tests/shared/currentHelpers.ts`
- `scripts/tests/shared/moduleUtils.ts`

`current/` は現行仕様の sim tests、`compat/` は互換確認だけを置く層です。新規テストは `current/` か `modules/` 側へ追加し、`compat/` は既存互換の保全に限定してください。
`shared/currentHelpers.ts` には旧 `allCases.ts` 由来の共通 helper とテスト用初期化だけを残しています。

## リアリズム検証フロー

日々の調整では、重い Monte Carlo を常用しません。

推奨フロー:

1. `node scripts/tests/run_sim_tests.cjs --suite unit --scope <関連scope> --workers 1`
2. `npm run report:realism:quick`
3. `npm run report:realism:retire`
4. 必要時のみ `npm run report:realism:aptitude`
5. 最終確認だけ `npm run report:realism:acceptance`

出力先:

- Markdown: `docs/balance/`
- UI/UX strict rules: `docs/ui-ux-rules.md`
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
