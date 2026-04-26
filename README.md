# sumo-maker2

Web ブラウザで動く大相撲キャリアシミュレーションです。
本格的な相撲ロジックで力士の一生を再現し、その記録を読む観測ゲームとして設計しています。

React + TypeScript + Vite で UI を、`src/logic` で React 非依存のドメインロジックを構成しています。

---

## このゲームは何か

- 新弟子の出自と素地を設計し、その後の相撲人生を記録として読むゲームです。
- 日々の育成管理を繰り返すゲームではありません。
- 強い力士だけでなく、印象に残る人生や希少な記録にも保存する価値があります。

プレイヤーは土俵の外から力士を操作するのではなく、入門時点の条件を与えたうえで、その後の一生を読み解く立場に徹します。番付、昇降格、怪我、取組、引退といった相撲制度の積み重ねが、結果として現れる記録に説得力を与えます。

### コア体験ループ

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

### 相撲ロジックの立ち位置

- 番付、昇降格、取組、怪我、引退は「管理すべきゲーム要素」ではなく、記録に説得力を与える基盤
- 本格感は用語の多さではなく、最終的に現れる人生の納得感として伝える
- リアリズムは表で誇示するより、`この結果ならありそうだ` と感じさせる形で効かせる

### 保存と資料館

- 保存はプレイの主目的ではなく、`読んだあとに残したくなるか` を判断する行為
- 保存価値は最高位や優勝回数だけでなく、希少な記録、浮沈、宿敵関係、印象に残る歩みからも生まれる
- `資料館` は単なる収集帳ではなく、自分が見届けた相撲人生の私設アーカイブとして位置づける

### 成功指標

- 1 プレイが短く終わっても、1 人の力士像が記憶に残ること
- `力士記録` の冒頭だけで、その人物の輪郭と最終到達点が分かること
- 詳細へ進むと、整理されたデータベースとして気持ちよく掘れること
- 戦績や番付推移だけでなく、対戦相手や転機まで含めて人物像が立ち上がること
- 強い力士を見たい欲求と、別の人生を読みたい欲求の両方が自然に次のプレイへつながること

---

## 画面ごとの役割

コンセプト上の呼称を使います。現行 UI のラベルは括弧内に併記します。
各画面の実装詳細は [src/features/README.md](./src/features/README.md) を参照してください。

| 画面 | 役割 |
|------|------|
| ホーム | 新規開始・続きから・保存済み記録・資料館への導線 |
| 新弟子設計（UI: スカウト） | 四股名、出身地、入門年齢、体格、学歴・競技歴、部屋、気質を決める。完成形ではなく人生の出発点と伸び方の種を決める |
| シミュレーション | 途中介入せず、フルキャリアを Web Worker で演算する |
| 力士記録（UI: 力士結果） | 静かな表紙（四股名 / 出身地・部屋 / 最高位 / 通算成績）→ プロフィール / 戦績 / 番付推移 / 対戦・宿敵のタブ |
| 保存済み記録（UI: 保存レコード） | 見届けた人生を一覧し、あとから読み返す |
| 資料館（UI: 力士コレクション） | 希少な記録や未発見要素の収集・読み返し |
| Logic Lab | 開発用。固定 seed と preset で同一キャリアを再現する検証 UI |

---

## セットアップ

```bash
npm install
npm run dev
```

ブラウザで Vite の開発サーバーを開いてください。ビルドは `npm run build`。

---

## 開発ワークフロー

### よく使うコマンド

```bash
npm test                        # sim tests（unit suite）
npm run lint                    # ESLint
npm run build                   # tsc + vite build
npm run doc:audit               # サブ README の欠落検出
npm run report:calibration      # 校正データ再生成
npm run report:realism:quick    # realism の quick probe
```

テストの suite / scope 指定方法や report スクリプトの全一覧は
[scripts/README.md](./scripts/README.md) を参照してください。

### リアリズム検証フロー

日々の調整では、重い Monte Carlo を常用しません。

1. `node scripts/tests/run_sim_tests.cjs --suite unit --scope <関連scope> --workers 1`
2. `npm run report:realism:quick`
3. `npm run report:realism:retire`
4. 必要時のみ `npm run report:realism:aptitude`
5. 最終確認だけ `npm run report:realism:full`

出力先:

- Markdown: `docs/balance/`
- UI/UX strict rules: `docs/ui-ux-rules.md`
- JSON: `.tmp/`

quick 系レポートは `target / actual / pass-fail` 形式、full は詳細レポートです。

---

## ドキュメント構成

全体像は以下の目次から読んでください。

| ドキュメント | 内容 |
|-------------|------|
| [src/features/README.md](./src/features/README.md) | 画面単位の feature 一覧と各 feature の責務 |
| [src/logic/README.md](./src/logic/README.md) | UI 非依存のドメインロジック（シミュレーション・番付・永続化など）一覧 |
| [src/app/README.md](./src/app/README.md) | アプリシェル |
| [src/shared/README.md](./src/shared/README.md) | 汎用 UI 部品・hook |
| [scripts/README.md](./scripts/README.md) | tests / reports の配置と運用 |
| [CODING_GUIDELINES.md](./CODING_GUIDELINES.md) | コーディング規約（TypeScript / React / 命名 / 日本語コメント / ドキュメント） |
| [AGENTS.md](./AGENTS.md) | 開発スタンスとドキュメント運用ルール |

ディレクトリの大枠:

```text
src/app              アプリ全体の画面構成
src/features         機能単位の UI / state / worker
src/logic            UI 非依存の相撲ドメインロジック
src/shared           汎用 UI 部品と hook
scripts/tests        決定論テストと runner
scripts/reports      分布確認・分析レポート
scripts/shared       scripts 間で共有する補助ロジック
docs/balance         人手で読むレポート
.tmp                 再生成可能な一時生成物
```

新規 feature や logic モジュールを追加したら、該当ディレクトリに `README.md` を必ず置いてください。`npm run doc:audit` で欠落を検出できます。詳細は [AGENTS.md](./AGENTS.md) の「ドキュメント運用ルール」節を参照。

---

## モデルと KPI

現行の観測対象:

- 現行 runtime 1 系統（単一モデル）

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

---

## 保存互換について

- 保存互換は強く維持していません
- 現在は `sumo-maker-v13`
- 旧 save との非互換があり得るため、ロジック更新時に DB 名を更新する方針です

---

## 注意点

- `npm run build` では chunk size warning が出ることがありますが、現状は build failure ではありません
- Monte Carlo は時間がかかるため、日常調整では quick probe を優先してください
- `progress.md` は作業ログであり、README には要点だけを載せています

## ライセンス

公開条件が未整理のため、現時点では明示していません。
