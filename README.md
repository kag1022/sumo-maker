# sumo-maker2

Web ブラウザで動く大相撲キャリアシミュレーションです。  
プレイヤーは新弟子の初期条件を設計し、その後の相撲人生を観測し、記録を読む立場に徹します。

React + TypeScript + Vite で UI を構成し、相撲ロジックは `src/logic` に分離しています。

## このゲームの軸

- 主体験は「操作」ではなく `設計 -> シミュレーション -> 記録読解`
- 番付・昇降格・取組・引退は、履歴に説得力を持たせるための基盤
- 横綱到達だけでなく、停滞・再浮上・負け越し続きのキャリアにも価値を持たせる
- UI は日本語中心、和の空気感とレトロゲーム文脈を両立する

## 10-star 商品仕様案

この章は「いま実装済みの仕様」ではなく、今後このタイトルを `何度も回したくなる相撲人生コレクションゲーム` に引き上げるための到達仕様です。

### 目指す作品像

- プレイヤー体験の中心は `進行を見守ること` ではなく `結果を開封すること`
- 1プレイは短く、`引く -> 少し決める -> 即結果を見る -> 保存/破棄する -> 図鑑が埋まる` を高速で回す
- 集める対象は「強い力士」だけでなく、「珍しい人生」「悲運の経歴」「称号」「系譜」
- リアルな相撲ロジックは裏側で効かせ、表の体験はあくまでテンポと余韻を優先する

### コア体験ループ

1. 候補を引く
2. 1〜3 個だけ意味のある項目を決める
3. 途中表示なしでフルキャリアを即シミュレートする
4. 結果画面を「一代記の開封」として見る
5. 保存するか、図鑑に登録して次へ進む
6. レア人生・未発見称号・系譜進捗を見てもう一度回す

### 体験原則

- 進行中の監督盤、実況ログ、長い途中停止はプロダクトの主軸にしない
- 1プレイの快感は `途中経過` ではなく `最終結果の驚き` に集中させる
- プレイヤーの判断は多くしすぎず、毎回「少しだけ運命に触れた」と感じる量に留める
- 情報は `最初に全部見せる` のではなく `結果画面で解放される` 構造にする

### セッション設計

- ホームでは難しい説明を置かず、主導線を `候補を引く` に一本化する
- スカウト画面では、入力フォームではなく `運命の微調整` に見える UI を採用する
- シミュレーション開始後はローディングまたは短い演出だけを見せ、即レポートへ遷移する
- レポートの冒頭 1 画面で「どんな人生だったか」を瞬時に理解できるようにする

### 結果開封の演出仕様

- 最初の 3 秒で次を判断できること
- まず表示するのは `四股名 / 最高位 / 通算成績 / 人生称号 / レア度 / 象徴的な一文`
- 次に `番付推移` `優勝・三賞` `宿敵` `転機` を短く見せる
- 深掘りは 2 階層目に送る。初手で長文や詳細表を出しすぎない
- 結果画面は「分析画面」より先に「開封画面」であるべき

### コレクション仕様

- 保存対象は `キャリア結果` そのもの
- 図鑑は以下の 4 系統で埋まる構造にする
  - 人生称号: 例 `怪童`, `遅咲き大関`, `悲運の関取`, `短命の天才`
  - 達成記録: 横綱到達、三賞、幕下全勝、連続負け越しなど
  - 系譜: 親方・一門・型・体格・出身地などの埋まり
  - 宿命札: 宿敵、優勝阻止、怪我転落、奇跡の再浮上など
- 図鑑の価値は「最強だけが正義」ではなく「珍しさ」「語りたさ」に置く

### レア度設計

- レア度は候補の初期素質ではなく、`最終的に生まれた人生の珍しさ` にも紐づける
- 低素質でも珍しい人生なら高評価になる余地を残す
- レア度は最低でも次の 3 軸で算出する
  - 競技的価値: 最高位、優勝、三賞、勝率
  - 物語的価値: 怪我、復活、停滞、宿敵、阻止された優勝
  - 希少性: 発生率、未発見度、図鑑全体での出現頻度

### リテンション仕様

- 無料で毎日 1 回以上は回せる
- 保存・図鑑・未発見要素が毎日起動理由になるようにする
- 短期目標は `次の 1 回を引きたくなること`
- 中期目標は `図鑑の穴を埋めたくなること`
- 長期目標は `自分の相撲博物館を育てたくなること`

### 収益化仕様

- 収益化は `邪魔な広告` ではなく `もう 1 回回せる対価` に寄せる
- 基本は以下の順で設計する
  - 1日1回無料スカウト
  - 広告視聴で追加スカウト
  - 保存枠や演出強化など、ゲーム性を壊しにくい軽課金
- リワード広告は `結果を見る前` ではなく `もう 1 回引く直前` に置く
- 広告で得るものは「強さそのもの」より `試行回数` と `保存体験の快適さ` を優先する

### UX の禁止事項

- 途中経過を長く見せて 1 プレイをだらけさせない
- 毎回ほぼ同じ人生に見える出力にしない
- 初手から複雑な数値、表、長文説明を出しすぎない
- プレイヤーが「作業」と感じる入力量にしない
- 図鑑で珍しさや収集の手応えが見えない状態にしない

### 成功指標

- 1プレイ完了までが短く、連続試行しやすいこと
- 保存率より `再試行率` と `翌日再訪率` が強いこと
- 最高レア排出率ではなく、`珍しい人生を引いた感覚` があること
- レポート詳細を読まなくても、冒頭だけで「今回は当たりだったか」が分かること
- 広告導線が不快ではなく、自然に `もう1回` と接続していること

### 一言でいうと

このゲームは `相撲を操作するゲーム` ではなく、`相撲人生を開封して収集するゲーム` として磨く。

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
