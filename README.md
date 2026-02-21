# 爆速！横綱メーカー (`sumo-maker2`)

新弟子を作成し、入門から引退までの相撲人生を一気にシミュレーションする Web アプリです。  
React + TypeScript + Vite で動作します。

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
```

- `npm test`: シミュレーションの決定論テストを実行（`scripts/tests/sim_tests.ts`）
- `npm run build`: `tsc` + `vite build`

## ディレクトリ構成（主要部）

```text
src/
  app/
    App.tsx
  main.tsx
  features/
    scout/
      components/
        ScoutScreen.tsx
    report/
      components/
        ReportScreen.tsx
        AchievementView.tsx
        HallOfFameGrid.tsx
    simulation/
      hooks/
        useSimulation.ts
      store/
        simulationStore.ts
      workers/
        simulation.worker.ts
  shared/
    ui/
      Button.tsx
      Card.tsx
  logic/
    battle.ts / growth.ts / achievements.ts
    models.ts / constants.ts / initialization.ts
    catalog/
      enemyData.ts
    naming/
      playerNaming.ts
    persistence/
      careerStorage.ts
      db.ts
      repository.ts
    ranking/
      index.ts
      rankScore.ts
      banzukeLayout.ts
      topDivisionRules.ts
      lowerDivision.ts
      sekitoriCommittee.ts
      sekitori/
    simulation/
      runner.ts / engine.ts / basho.ts / career.ts / world.ts
      lowerQuota.ts / sekitoriQuota.ts / npcRecords.ts
      npc/
        npcShikonaGenerator.ts
      topDivision/
      lower/
      sekitori/
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
- `logic/simulation/career.ts`
  - 初期化、イベント追加、通算成績更新、引退確定
- `logic/battle.ts` / `logic/growth.ts` / `logic/ranking/index.ts`
  - ドメイン計算ロジック（勝敗、成長、番付）
- `logic/persistence/repository.ts`
  - `careers` / `bashoRecords` / `boutRecords` への非同期保存

### 依存注入（再現性向上）

`runSimulation` は依存注入に対応しています。

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

## 既知の注意点

- `vite build` で chunk size（500KB超）警告が出る場合があります。  
  現状は主にレポート画面のグラフ依存（`recharts`）によるものです。
- 警告はビルド失敗ではありません。
- 保存データ互換性: `sumo-maker-v6` 以降は旧 IndexedDB（`sumo-maker-v5` 以前）と互換性がありません。
- 番付編成モード:
  - `SIMULATE`（既定）: 会議ロジックで次場所番付を算出
  - `REPLAY`: 実データが与えられた力士は replay 指定番付を優先（完全再現向け）
