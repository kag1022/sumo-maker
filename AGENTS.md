# Hermes Context For Sumo Maker

## Overview

### このプロジェクトは何か

`sumo-maker` は、Webブラウザで動く大相撲キャリアシミュレーションゲームです。  
プレイヤーは力士を直接操作し続けるのではなく、**新弟子の初期条件を設計し、その後の一生を「記録として読む」** ことを主体験とします。

- 新弟子の出自、体格、気質、入門経路、部屋を決める
- フルキャリアを一気にシミュレートする
- 番付推移、戦績、宿敵、転機、実績を読む
- 保存する価値がある人生かを判断する

これは育成管理ゲームではなく、**観測ゲーム / 記録読解ゲーム** です。  
相撲制度のリアリズムは、UI上で数式として誇示するものではなく、最終的に現れるキャリアの納得感として機能する必要があります。

### 主要特徴

- React + TypeScript + Vite ベースのブラウザゲーム
- CSS Modules 主導 + Tailwind utilities 併用の UI 構成
- UIと完全分離された `src/logic/` の相撲ドメインロジック
- Web Worker 上で走るフルキャリアシミュレーション
- Dexie + IndexedDB によるキャリア、場所別記録、資料館進捗の永続化
- `banzuke`, `torikumi`, `injury`, `retirement`, `realism` を分けた大規模シミュレーション構成
- `chaptered` / `observe` / `skip_to_end` の複数進行モード
- 力士記録画面での「静かな表紙 → 詳細データベース」設計
- 平成実データベース由来の calibration / realism 検証パイプライン
- Logic Lab による seed 固定の再現検証
- `scripts/tests` と `scripts/reports` による決定論テストと分布検証

### 現状の規模感

- `src/` 配下だけで約 `300` ファイル
- UI feature 群と domain logic 群が明確に分離されている
- 少なくとも以下の独立サブシステムを含む:
  `app`, `features`, `shared`, `simulation`, `banzuke`, `persistence`, `build`, `scout`, `calibration`, `kimarite`, `style`, `ranking`, `economy`, `career`, `oyakata`, `catalog`, `telemetry`

## Technology Stack

- UI: React 18, TypeScript, Vite
- 状態管理: Zustand
- 永続化: Dexie / IndexedDB
- スタイル: CSS Modules, Tailwind CSS, CSS variable theme tokens
- 描画補助: Recharts, Framer Motion
- 品質管理: ESLint 9 (`npm run lint` は常時 green が前提)
- テスト/検証: 独自 `scripts/tests` ランナー、`scripts/reports` 分析スクリプト
- 外部実データ生成: `sumo-db/` の Python スクリプト群

## Directory Structure

重要部分だけを抜粋します。

```text
src/
  app/                 アプリ全体のシェル、画面切替、上位オーケストレーション
  features/            画面単位のUIとfeatureローカル状態
    home/              ホーム
    scout/             新弟子設計
    simulation/        Web Worker 経由のシミュレーション制御
    bashoHub/          場所の劇場表示
    careerResult/      今回のキャリア結果を読む画面
    report/            保存済み記録のアーカイブ
    collection/        資料館
    settings/          設定 / データ削除
    logicLab/          開発用の再現検証UI
    shared/            feature横断だが domain 寄りの共有UI
  logic/               React 非依存のドメインロジック
    simulation/        キャリア進行エンジン本体
    banzuke/           番付編成・昇降格・委員会ロジック
    persistence/       Dexie 永続化
    build/             初期能力と物語条件の組み立て
    scout/             新弟子候補の抽選・候補生成
    calibration/       実データ由来の校正値
    kimarite/          決まり手カタログと選定
    style/             型・相撲スタイルの生成と進化
    ranking/           rank の数値換算
    economy/           賞金・ポイント周り
    career/            clear score 等の総合評価
    oyakata/           親方 / 部屋の定義
    catalog/           NPCテンプレート
  shared/              汎用UIコンポーネントと hook
    styles/            shared surface / typography / table の CSS Modules
  index.css            theme tokens, base reset, animation utilities のみ
scripts/
  tests/               決定論テスト
  reports/             分布・realism レポート
  shared/              スクリプト共通補助
sumo-db/
  scripts/             calibration 用データ抽出スクリプト
  data/analysis/       生成済みの分析JSON/CSV
docs/
  balance/             人間が読む検証レポート
```

## Architecture Principles

### 1. `logic` は React 非依存の純ドメイン層

- `src/logic/` では `import React` を禁止
- `scripts/tests` や `scripts/reports` から直接呼べることが前提
- UI都合の状態や表示整形は `features` 側で持つ
- 重い処理や相撲制度ロジックは `logic` に置く

### 2. `features` は画面単位で閉じる

- feature 間の直接 import は原則避ける
- feature 横断のドメイン共有は `src/logic/`
- 汎用UIは `src/shared/`
- 複数featureで使うが domain 寄りの部品は `src/features/shared/`

### 2.5. スタイルは CSS Modules 主導で閉じる

- 画面や部品の見た目は、原則としてコンポーネント隣接の `*.module.css` に置く
- 共通の surface / typography / table は `src/shared/styles/*.module.css` を使う
- `src/index.css` は theme tokens、base reset、scrollbar/input/selection、animation utility だけを持つ
- 新しい visual component class を `src/index.css` に足さない
- Tailwind は spacing / layout / composition 補助に使い、色・境界線・背景・タイポグラフィの責務は Modules 側を優先する
- `tailwind.config.js` の色は CSS 変数参照なので、固定色を直接増やさず token を更新する

### 3. グローバル進行は `App.tsx` + `simulationStore` に集約される

- `src/app/App.tsx` が画面遷移の上位オーケストレーター
- `src/features/simulation/store/simulationStore.ts` がシミュレーション状態の中枢
- `useSimulation()` は store の薄い selector 集合であり、実ロジック本体ではない

### 4. 長時間シミュレーションは必ず Web Worker に逃がす

- UI スレッドでフルキャリア進行を回さない
- `simulation.worker.ts` が engine と persistence の橋渡し
- `chaptered` / `observe` 時は詳細情報を eager に流す
- `skip_to_end` 時は buffered で進め、最終的に詳細をまとめて flush する

### 5. 保存は「キャリア本体」と「場所単位詳細」を段階的に扱う

- キャリアは `draft -> unshelved -> shelved` の流れを持つ
- detail build が `idle / building / ready / error` を持つ
- 結果画面は summary だけ先に見せ、詳細は裏で構築できる
- 保存済み一覧と今回結果画面は persistence を介してつながる

### 6. リアリズムはコード上の見た目より、結果の納得感を優先する

- 取組、怪我、昇降格、引退、型の進化は独立サブシステムとして存在する
- だが目的は制度の完全再現ではなく「ありそうな一代」を作ること
- バランス変更は intuition ではなく quick report と tests で確認する

### 7. README は分散管理が前提

- ルート `README.md` は入口だけを持つ
- 詳細責務は各 feature / logic サブREADMEに委ねる
- ドキュメントを腐らせないことが重要で、コード変更と README 更新はセット

## Coding Conventions

### TypeScript / React

- `export default` 禁止。named export を使う
- 関数定義は arrow function を優先
- 型名は `PascalCase`
- 変数・関数は `camelCase`
- 定数は `UPPER_SNAKE_CASE`
- object 構造は `interface`、union や utility は `type`
- `*.ts` は原則シングルクォート
- `*.tsx` は原則ダブルクォート
- セミコロンあり
- インデントは 2 スペース

### React 固有ルール

- `import React from "react";` 形式を使う
- hooks は `React.useState`, `React.useEffect` の形で呼ぶ
- `import { useState } from "react"` は使わない
- コンポーネント定義は `React.FC<Props>` + arrow function

### コメントと言語

- コメントは日本語
- TODO / FIXME は英語でよい
- UI文言も日本語中心
- 相撲用語は日本語優先で、英語ラベルは補助に留める

### 命名規則

| 対象 | 形式 | 例 |
|------|------|----|
| コンポーネントファイル | PascalCase | `CareerResultPage.tsx` |
| ロジックファイル | camelCase | `composeNextBanzuke.ts` |
| 型 | PascalCase | `RikishiStatus` |
| 状態enum/union | UPPER_SNAKE_CASE リテラル | `'PUSH'`, `'GRAPPLE'` |
| CSS Module class | camelCase | `detailCard`, `sectionHeader` |
| 旧global CSS class | kebab-case | `surface-panel` |

### パフォーマンス重視のポイント

- フルキャリア計算は UI スレッドで走らせない
- `skip_to_end` 系の変更では buffered detail build を壊さない
- `logic` を Node から呼べる構成を守る
- Monte Carlo は重いので、日常調整では quick report を優先する
- 描画用に毎回重い集計を再計算しない。可能なら persistence か engine 側で段階生成する
- `App.tsx` や `simulationStore.ts` に重い domain 計算を持ち込まない
- style 変更でも `npm run build` と `npm run lint` を壊さない

## Important Facts / Never Forget

- このゲームは「育成管理ゲーム」ではなく「記録観測ゲーム」。
- プレイヤー操作の中心は **新弟子設計** であり、キャリア途中の介入は主役ではない。
- UIの魅力は派手な操作量ではなく、整理された記録から人物像が立ち上がること。
- `src/logic/` は React 非依存を厳守すること。
- feature 間の直接依存は増やさない。共有が必要なら `logic` か `shared` に上げる。
- 保存互換は強く維持しない方針。破壊的変更時は DB 名更新が前提。
- ただし **Dexie schema version と DB 名は別物**。
  - DB 名: `sumo-maker-v13`
  - `db.ts` 内の schema migration version: 現在 `16`
  - ここを混同すると migration 判断を誤る。
- `logicLab` で見つけた問題は、最終的に `scripts/tests/` か `scripts/reports/` に落とし込む。
- 新しい `src/features/<name>/` ディレクトリには `README.md` が必須。
- 新しい `src/logic/<name>/` ディレクトリにも `README.md` が必須。
- `src/logic/` に単体 `*.ts` を増やした場合は親 `src/logic/README.md` の一覧に追記する。
- `npm run lint` は green が前提。既知lint負債を放置する前提で作業しない。
- ルート `README.md` を巨大化させない。詳細はサブREADMEへ逃がす。
- ドキュメント監査は `npm run doc:audit`。
- 日常の realism 調整では acceptance Monte Carlo を常用しない。
- 日本語コメントと和の空気感は仕様であり、後回しの装飾ではない。
- 相撲制度とゲーム体験が衝突したら、まず「読後の納得感」を軸に設計判断する。
- ユーザーの意向に迎合せず、制度整合性・コード保守性・ゲーム体験の一貫性を優先して提案する。
- 新しい shared visual pattern を増やす時は、まず `src/shared/styles/` に上げるべきかを判断する。
- ライトモード対応は class 個別 override ではなく token 駆動を優先する。

## Key Files

特に重要なファイルを絞って記します。

| ファイル | 役割 |
|---------|------|
| `README.md` | ルート入口。ゲームの体験方針、画面役割、主要コマンド、各READMEへの案内 |
| `AGENTS.md` | エージェント向けの開発スタンスとドキュメント運用ルール |
| `CODING_GUIDELINES.md` | TypeScript / React / 命名 / コメント / フォーマット規約 |
| `package.json` | 開発・テスト・report コマンドの正式な入口 |
| `src/app/App.tsx` | 全画面のオーケストレーション。ホーム、スカウト、劇場、結果、アーカイブの切替中枢 |
| `src/app/AppShell.tsx` | デスクトップ/モバイル両対応のアプリシェルとナビゲーション |
| `src/index.css` | theme tokens / base reset / animation utility を持つ最小 global stylesheet |
| `src/shared/styles/surface.module.css` | 共通 surface contract。panel, card, premium, metric などの見た目基盤 |
| `src/shared/styles/typography.module.css` | 共通 typography contract。heading, label, metric, sectionHeader など |
| `src/shared/styles/table.module.css` | 共有 table / scroll / link button の見た目基盤 |
| `tailwind.config.js` | CSS変数ベースの utility color 定義。dark / light token 切替の入口 |
| `src/features/scout/components/ScoutScreen.tsx` | 新弟子設計UI。入力を simulation 開始可能な形へ整える |
| `src/features/simulation/store/simulationStore.ts` | シミュレーション phase、worker 通信、保存、再開、結果公開の中核 |
| `src/features/simulation/workers/simulation.worker.ts` | Web Worker 本体。engine 実行、pause/resume、detail build、DB flush を担当 |
| `src/features/careerResult/components/CareerResultPage.tsx` | 今回のキャリアを読む主画面。保存判断もここにつながる |
| `src/logic/models.ts` | ドメイン全体の共通型。ほぼ全サブシステムの言語仕様書 |
| `src/logic/initialization.ts` | 初期力士生成。build/scout の最終出力を `RikishiStatus` に落とす |
| `src/logic/simulation/runner.ts` | フルシミュレーションの簡易エントリ。scripts や検証で使いやすい |
| `src/logic/banzuke/committee/composeNextBanzuke.ts` | 番付編成の重要中枢。proposal, review, constraint を統合する |
| `src/logic/persistence/db.ts` | Dexie DB 定義、schema migration、永続化テーブルの基盤 |

## Development Workflow Reference

よく使うコマンド:

```bash
npm run dev
npm run build
npm run lint
npm test
npm run test:verification
npm run test:docs
npm run doc:audit
npm run report:torikumi:quick
npm run report:realism:quick
npm run report:realism:retire
npm run report:banzuke:quick
npm run report:banzuke:quantile
npm run report:banzuke:validation
npm run report:calibration
npm run report:roster:integrity
```

基本原則:

1. まず関連する `scripts/tests` を通す
2. `npm run lint` を通す
3. realism / banzuke / torikumi の quick report で必要な分布を確認する
4. acceptance や Monte Carlo は最後の確認だけで回す
5. ディレクトリ責務を変えたら README を更新する

## Areas Requiring Extra Care

### 1. `App.tsx` はすでに責務が重い

ここに feature 固有ロジックや domain 条件分岐を足し続けると破綻しやすいです。  
新しい大きな導線や phase を増やすなら、`App.tsx` に直接積むのではなく、feature 側または専用の上位 controller へ逃がすことを検討してください。

### 2. シミュレーション変更は 1 ファイルでは完結しない

`simulationStore.ts`, `simulation.worker.ts`, `logic/simulation/workerProtocol.ts`, 関連UI の整合が必要です。  
phase, pacing, detailState を一箇所だけ変えると簡単に壊れます。

### 3. 番付ロジックは rule density が高い

`banzuke/committee`, `rules`, `providers`, `optimizer` は相互依存が強いです。  
軽い変更でも quick / quantile / validation report を見ずにマージしない方がよいです。

### 4. persistence は summary と detail の二層構造を持つ

キャリア概要だけ ready でも、場所詳細は building のことがあります。  
この段階差を無視すると、結果画面・保存処理・アーカイブ再読込で破綻します。

### 5. calibration データは runtime logic と一緒に扱う

`sumo-db/` は単なる資料置き場ではなく、`src/logic/calibration/` の元データ生成源です。  
校正値を変えるなら、参照JSONだけ差し替えて終わりではなく、生成経路と report の整合まで見る必要があります。

### 6. 通常プレイと Logic Lab を混同しない

- 通常プレイ: 体験品質が最優先
- Logic Lab: 再現性と差分観測が最優先

Logic Lab で便利でも、本編体験を汚す UI や設定露出は避けるべきです。

### 7. UIの和風・ピクセル調は世界観そのもの

このプロジェクトでは、和の伝統とレトロゲーム感は装飾ではありません。  
見た目をモダン化しすぎて generic dashboard に寄せると、体験の芯が抜けます。

### 8. ドキュメント更新を後回しにしない

このコードベースは大きく、README 分散運用を前提に全体把握しています。  
README 未更新は単なる雑務漏れではなく、将来の改修コストを直接増やします。

### 9. `index.css` を再び肥大化させない

現在の `src/index.css` は token/base 主体に整理されています。  
新しい画面や component の装飾クラスをここへ戻し始めると、保守性と light mode 整合がすぐ崩れます。

### 10. shared style contract の破壊に注意する

`surface.module.css`、`typography.module.css`、`table.module.css` は複数featureの見た目契約です。  
ここを変える時は、局所最適ではなく横断影響で判断してください。

## Heuristics For Future Changes

- 新しい仕様が「キャリア途中の操作量」を増やすなら、本作の核体験を壊していないか疑う
- 新しい状態が global か local かを先に判断する
- 画面都合の値を `logic` に持ち込まない
- scripts から呼べない logic は設計を疑う
- 新しい見た目ルールが feature ローカルか shared contract かを先に判断する
- 相撲制度の細部を追加する時は、UIの読みやすさまで含めて設計する
- 「面白い」だけでなく「あとで読んだ時に人生として納得できるか」を評価基準にする
- 保存・再開・詳細構築・表示の非同期境界を甘く見ない
- 変更後は必ず、tests / lint / quick report / README 更新のどれが必要かを明示的に判断する
