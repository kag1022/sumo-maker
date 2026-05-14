# src/features

機能単位の UI / 状態管理 / Web Worker を置く層です。
各 feature は独立したまとまりで、原則として feature 間を直接 import しない方針です。

## 各 feature の概要

| ディレクトリ | 画面・役割（UI 上の名称） | README |
|-------------|---------------------------|--------|
| `scout/` | 新弟子設計（スカウト） | [scout/README.md](./scout/README.md) |
| `observationBuild/` | 観測テーマと追加ビルド選択 | [observationBuild/README.md](./observationBuild/README.md) |
| `observation/` | 観測導線の旧/予備領域 | [observation/README.md](./observation/README.md) |
| `simulation/` | フルキャリア進行（Web Worker） | [simulation/README.md](./simulation/README.md) |
| `bashoHub/` | 場所の進行を観る劇場画面 | [bashoHub/README.md](./bashoHub/README.md) |
| `careerResult/` | 力士記録（力士結果） | [careerResult/README.md](./careerResult/README.md) |
| `report/` | 保存済み記録（保存レコード） | [report/README.md](./report/README.md) |
| `collection/` | 資料館（力士コレクション） | [collection/README.md](./collection/README.md) |
| `docs/` | 用語表の試験的画面（通常導線には未接続） | [docs/README.md](./docs/README.md) |
| `home/` | ホーム画面 | [home/README.md](./home/README.md) |
| `settings/` | 設定・データ管理 | [settings/README.md](./settings/README.md) |
| `logicLab/` | 開発用の preset + seed 検証画面 | [logicLab/README.md](./logicLab/README.md) |
| `shared/` | feature 間で使う小さな共通 UI | [shared/README.md](./shared/README.md) |

## 共通ルール

- React 依存コードはここに置き、ドメインロジックは `src/logic/` に置きます。
- feature 間の直接 import は避け、必要なら `src/logic/` か `src/shared/` を経由します。
- 新しい feature を追加したら、このテーブルへの追記と feature 配下の `README.md` 作成をお願いします（`npm run doc:audit` で検出できます）。
