# logic/persistence

IndexedDB（Dexie）による永続化層。キャリア本体とその付随ログ、
資料館の解放状態などを一元的に扱います。

## 主要ファイル

| ファイル | 内容 |
|----------|------|
| `db.ts` | Dexie DB 定義と open 処理 |
| `shared.ts` | 共通ユーティリティ |
| `careers.ts` | 保存キャリア本体 |
| `careerHistory.ts` | キャリア履歴 |
| `careerStorage.ts` | 保存と読込の上位 API |
| `collections.ts` | 資料館（解放状況）の永続化 |
| `generationTokens.ts` | キャリア生成専用の生成札 |
| `observationPoints.ts` | 観測点の残高と台帳 |
| `oyakata.ts` | 部屋情報の永続化 |
| `wallet.ts` | 旧ポイント系 API（新規メタ進行では直接使わない） |
| `ads.ts` | 広告・告知系の状態 |

## DB 名

- 現在: `sumo-maker-v14`
- 保存互換は強く維持しない方針。破壊的な schema 変更時は DB 名を更新する。
- Dexie schema version は DB 名とは別。現在の最新 schema は `18`。
- `careers.observationStanceId` は資料館検索用に index 化する。保存推奨や自動タグなどの派生分析は DB に固定保存せず、`finalStatus` から再計算する。
- `boutRecords.boutFlowCommentary` は player bout 詳細表示用の非 index payload。Dexie の index 変更ではないため schema version は据え置き、保存済み旧 row は単に未解説として扱う。

## 観測メタ進行

- 生成札はキャリア生成専用。上限 5、30 分で 1 回復。
- 観測点は detail build 完了時に `careerObservationClaims` を通じて一度だけ付与する。
- 保存・削除は観測点の付与条件にしない。保存削除でも claim / 観測点 / 資料館進捗は残す。

## テスト

- `scripts/tests/modules/persistence.ts`
- `scripts/tests/current/persistence.ts`
