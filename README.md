# 力士人生シミュレーション (`sumo-maker2`)

新弟子を作成し、入門から引退までの相撲人生を一気にシミュレーションする Web アプリです。  
React + TypeScript + Vite で動作します。

## 1. 本質定義

本作は、**新弟子を生成し、その力士の生涯統計を生成・観賞するシミュレーションゲーム**である。

プレイヤーの役割は操作ではない。

・設計する
・実行する
・記録を読む

妄想はプレイヤー側で行う。

ゲームは“素材”を提供する。

---

## 2. 体験の中心

中心価値は「物語」ではなく、

**履歴の連続性と統計の整合性**。

具体的には：

・番付推移
・勝敗分布
・優勝履歴
・三役在位年数
・大関滞在年数
・横綱到達有無
・怪我履歴
・最高位年齢

これらを時系列で眺めることが主体験。

---

## 3. 制度の役割

番付・昇進・取組は

**データに説得力を持たせるための物理法則**

である。

目的は再現ではなく、

> 数字を見たときに「あり得そう」と思える整合性

制度は厳格に再現するが、
演出は最小限。

---

## 4. 横綱の位置づけ

横綱はゲームの勝利条件ではない。

横綱は「最上位レア属性」。

横綱到達率は極低確率（0.3〜0.8%）。

横綱になると：

・履歴に明確なマーカー
・生涯スコア大幅加算
・コレクション価値上昇

だが、横綱未満にも価値を持たせる。

---

## 5. プレイヤー行為

プレイヤーが行うのは：

・新弟子パラメータ設定
・部屋選択
・成長傾向選択（限定的）
・実行

その後は

**人生が一気に展開する。**

介入は最小。

---

## 6. 可視化設計（最重要）

UIは以下に集中する。

### ① 番付推移グラフ

縦軸：番付
横軸：場所
ピーク・転落が一目で分かる。

### ② 年齢曲線

能力・勝率の推移。

### ③ 勝敗ヒートマップ

安定型か波型かが見える。

### ④ タイトル・タグ

「名大関」「三役常連」など数値から自動生成。

テキスト物語は不要。

---

## 7. 再現優先領域

番付・昇進・取組に加え、

必須再現：

・年齢成長曲線
・怪我・休場履歴
・優勝決定方式
・引退判定
・三賞
・連続記録

これらは履歴の厚みを生む。

---

## 8. スコアリング設計

生涯スコアは：

* 最高位重み
* 在位年数
* 優勝回数
* 三役在位
* 大関在位
* 横綱昇進
* 復活回数
* 長期安定性

を統合した指数。

目的はランキングではなく、

「この力士はどんな人生だったか」を数値で示すこと。

---

## 9. 世界観のトーン

* ナレーション少なめ
* 解説最小限
* 数字が主役

説明過多にしない。

プレイヤーが空白を埋める。

---

## 10. 核心思想

このゲームは

「横綱を目指すゲーム」ではない。

「横綱になれなかった人生も含めて価値があるゲーム」。

妄想は成功よりも、

・惜敗
・停滞
・再浮上
・年齢との戦い

から生まれる。

# 設計の重心（技術的）

第1プランを採用し、

・番付決定は説明可能
・理由コード保存
・Monte Carloで分布固定
・能力モデルと年齢曲線を強化

する。

制度は安定装置。
履歴は妄想装置。



# 最終定義（1文）

> 本作は、現実準拠の制度下で生成された力士の生涯統計を観賞し、プレイヤーが自由に妄想するための相撲人生シミュレーターである。

---

## 11. 取組（勝敗判定）ロジックの詳細 (v2準拠)

本作の勝敗判定は、単純なステータスの大小だけでなく、状態や相性、スキル（特性）が複雑に絡み合う確率（ロジスティック関数）ベースで計算されます。

### ① 基礎戦闘力の算出
- **基本能力値**: 8つのステータスの平均値がベースとなります。
- **調子・体格補正**: その場所の調子で基本値が変動し、身長・体重から算出される「体格スコア」の差分が戦闘力に加味されます（アンコ型などの体格タイプ補正も存在）。
- **戦術相性**: 自分の戦術（押し・四ツ・技能）と相手の傾向によって相性補正（有利・不利）がかかります。
- **得意技ボーナス**: 得意技に関連するステータスが十分に高い場合、固定ボーナスが加算されます。

### ② スキル（特性）とDNAによる状況補正
力士の持つスキルや遺伝的要素（DNA）により、取組の文脈に応じた大幅な補正がかかります。
- **プレッシャー・大一番**: 「強心臓」「ノミの心臓」「大舞台の鬼」などにより、勝ち越しのかかった一番や優勝争い、横綱・大関戦での戦闘力が上下します。
- **連勝・連敗状態**: 「連勝街道」やDNAの連勝/連敗への敏感さによって、勢いが戦闘力に反映されます。
- **序盤/終盤特性**: 「スロースターター」や「スタートダッシュ」など、場所のタイミングで強さが変化します。
- **体格・番付差**: 「巨人殺し」「小兵キラー」など、相手との能力差や体格差でステータスが強化されます。

### ③ 勝率の算出と勝敗判定
- 最終的な戦闘力と、相手の能力値を比較します。
- そこに双方の勝敗連数に応じた**モメンタム（勢い）ボーナス**、怪我によるペナルティを反映し、最終的な能力差を割り出します。
- この能力差をソフトキャップ（上限）に通し、ロジスティック関数を用いて **勝率（3% ～ 97%の間）** を算出、乱数により勝敗を決定します。

### ④ 土壇場の逆転と決まり手
- **逆転現象**: 敗北判定となった場合でも、「土俵際の魔術師」や「土壇場返し」を持っていれば、低確率で逆転勝利（うっちゃり等）が発生します。
- **決まり手の抽選**: 勝敗決定後、双方のプレイスタイル、体格、ステータス特性、所持スキル（「荒技師」など）、設定された得意技を加味した重み付け抽選により、適切な決まり手が選ばれます。


## 現在の機能

- 新弟子作成
  - 四股名、入門経歴、戦術、体格、スキルを選択
  - 入門年齢（例: 15/18/22）を保持し、レポート表示に反映
- キャリアシミュレーション
  - 年6場所を進行し、勝敗・怪我・成長・番付昇降・引退を計算
- レポート表示
  - 通算成績、階級別成績、能力推移、番付推移、イベント年表
- 保存機能
  - 殿堂入りデータを IndexedDB（Dexie）に保存/閲覧/削除
  - シミュレーション中は 1場所ごとにドラフト保存し、引退後に手動で殿堂入り確定

## 開発コマンド

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
npm run report:realism:mc
```

- `npm test`: シミュレーションの決定論テストを実行（`scripts/tests/sim_tests.ts`）
- `npm run build`: `tsc` + `vite build`
- `npm run report:realism:mc`: `unified-v1` の Monte Carlo 受け入れ判定（既定 500本 + 500本）

## ロジック検証モード（dev専用）

- `npm run dev` でのみ、ヘッダーに `ロジック検証` ボタンが表示されます。
- 検証モードでは `preset + seed` を指定してフルキャリアを GUI で追跡できます（通常実行モデルは `unified-v1` 固定）。
- `2モデル比較` ボタンは旧モデル（`legacy-v6` / `realism-v1`）の参照比較専用です。
- 同じ `preset + seed` の組み合わせで、初期能力生成からキャリア完了まで再現可能です。
- 検証モードの実行結果は DB 保存しません（殿堂入りやドラフト保存は行いません）。

## ディレクトリ構成（主要部）

```text
src/
  app/
    App.tsx
  main.tsx
  features/
    logicLab/         # 開発・解析用のロジック検証UI
    report/           # レポート・殿堂入り画面
      components/     # AchievementView, HallOfFameGrid, ReportScreen, などの画面要素
      utils/          # hoshitori.ts などのユーティリティ
    scout/            # 新弟子作成・入幕パラメータ設定
      components/
        ScoutScreen.tsx
    simulation/       # シミュレーション実行連携
      hooks/
      store/
      workers/
  shared/
    ui/               # 汎用UIコンポーネント (Button, Card, DamageMap 等)
  logic/
    achievements.ts / battle.ts / constants.ts / growth.ts / models.ts / initialization.ts
    balance/          # モデルのバージョンごとのパラメータ等 (realismV1.ts, unifiedV1.ts)
    banzuke/          # 番付編成ロジック (committee, optimizer, population, providers, rules, scale)
    catalog/          # 固定データ (enemyData.ts 等)
    kimarite/         # 決まり手判定ロジック (catalog.ts, matchup.ts)
    naming/           # 四股名生成
    persistence/      # 履歴保存・データベース連携 (careerStorage.ts, db.ts, repository.ts, wallet.ts)
    ranking/          # ランキングスコア計算
    scout/            # スカウトや初期能力生成
    simulation/       # シミュレーションエンジン中核機能群
      basho.ts / career.ts / engine.ts / matchmaking.ts / runner.ts / world.ts 等
      actors/         # アクター（力士エンティティ等）の表現
      boundary/       # モジュール境界で共有・利用される定義
      lower/          # 幕下以下の挙動・入替
      npc/            # NPC生成・引退・管理 (factory, retirement, stableCatalog 等)
      sekitori/       # 関取枠・昇降格候補の管理
      strength/       # 力士の強さ・能力（加齢・怪我等）の更新
      topDivision/    # 幕内・十両上位における特別ルールや三賞
      torikumi/       # 取組編成スケジューラ (policy.ts, scheduler.ts)
scripts/
  tests/
    sim_tests.ts
    run_sim_tests.cjs
  reports/
    balance_report.cjs
    run_balance_report.cjs
docs/
  ゲーム仕様.md
  リザルト画面仕様.md
  balance-report-500.md
```

## ディレクトリ運用ルール

- `src/features`: 機能単位で UI・状態管理・worker をまとめる
- `src/shared/ui`: 複数機能で使う共通 UI 部品
- `src/logic`: ドメイン計算とシミュレーションロジックのみ（UI依存を持たない）
- `scripts/tests`: テスト実行用スクリプト
- `scripts/reports`: 分析・レポート生成用スクリプト
- 使い捨ての作業ファイルはリポジトリ直下に置かず、`.tmp/` か `docs/` に寄せる

## アーキテクチャ概要

シミュレーションは以下の責務で分割されています。

- `logic/simulation/engine.ts`
  - 1場所単位の進行エンジン（進捗、Pause判定、NPC集計）
- `features/simulation/workers/simulation.worker.ts`
  - メインスレッド外でシミュレーション実行 + 場所ごとの永続化
- `features/simulation/store/simulationStore.ts`
  - Worker通信、進捗状態、殿堂入り操作を集約
- `logic/simulation/basho.ts`
  - 1場所の試合進行、怪我発生、優勝判定、主人公の取組詳細生成
- `logic/simulation/actors/` + `logic/simulation/world.ts`
  - `PLAYER_ACTOR_ID` を含む actor registry を正本とし、player/NPC を同一経路で roster 参加させる
- `logic/simulation/career.ts`
  - 初期化、イベント追加、通算成績更新、引退確定
- `logic/battle.ts` / `logic/growth.ts` / `logic/banzuke/` / `logic/simulation/torikumi/` / `logic/kimarite/`
  - ドメイン計算ロジック（勝敗、成長、番付編成処理と最適化、取組編成、決まり手生成）
- `logic/persistence/repository.ts`
  - `careers` / `bashoRecords` / `boutRecords` / `banzukeDecisions` への非同期保存

### 依存注入（再現性向上）

`createSimulationEngine` は依存注入に対応しています。

- `random`
- `getCurrentYear`
- `yieldControl`

既定では従来通り `Math.random` / `new Date().getFullYear()` / `setTimeout(...,0)` を使います。  
テスト時は固定 RNG を渡して再現可能な検証ができます。

## テスト方針

`scripts/tests/sim_tests.ts` では、以下を固定乱数で検証します。

- `battle`: 決定論的な勝敗と逆転スキル挙動
- `growth`: スナップショット的な能力変化
- `ranking`: 代表的な昇降格分岐
- `ranking` の簡易プロパティテスト（番付番号の下限保証）
- `storage`: `careerStartYearMonth` / `careerEndYearMonth` と保存ソート
- `simulation`: NPC集計範囲（全関取 + 主人公同階級）と重複防止
- `banzuke`: 決定理由コード・制約ヒット・委員会ログの整合性

## 既知の注意点

- `vite build` で chunk size（500KB超）警告が出る場合があります。  
  現状は主にレポート画面のグラフ依存（`recharts`）によるものです。
- 警告はビルド失敗ではありません。
- 保存データ互換性: `sumo-maker-v8` 以降は旧 IndexedDB（`sumo-maker-v7` 以前）と互換性がありません。
- 番付編成モード:
  - `SIMULATE`（既定）: 会議ロジックで次場所番付を算出
  - `REPLAY`: 実データが与えられた力士は replay 指定番付を優先（完全再現向け）
