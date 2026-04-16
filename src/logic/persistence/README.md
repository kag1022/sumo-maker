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
| `oyakata.ts` | 部屋情報の永続化 |
| `wallet.ts` | 通貨・所持品 |
| `ads.ts` | 広告・告知系の状態 |

## DB 名

- 現在: `sumo-maker-v13`
- 保存互換は強く維持しない方針。破壊的な schema 変更時は DB 名を更新する。

## テスト

- `scripts/tests/modules/persistence.ts`
- `scripts/tests/current/persistence.ts`
