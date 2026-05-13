# features/shared

複数の feature にまたがるが `src/shared/ui` ほど汎用ではない、
ドメイン寄りの共有コンポーネントを置きます。

## 配置の指針

- どの feature からも使う純 UI 部品 → `src/shared/ui/`
- ドメイン情報（力士、番付、NPC 等）に触る共有コンポーネント → ここ
- 1 feature でしか使わない → その feature 内に閉じて置く

## 主要ファイル

- `components/NpcCareerPanel.tsx` NPC キャリアパネル
- `models/` feature 横断の表示 read model 型
  - `models/banzukeReview.ts` report / careerResult で共有する番付審議表示モデル型
- `utils/` 共有整形ヘルパー
  - `utils/banzukeRows.ts` 場所詳細 row から同一 division の近傍番付を抽出する表示補助
