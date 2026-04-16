# src/shared

どの feature からも使える汎用 UI 部品と hook を置きます。
ドメイン情報（力士、番付、NPC など）には触らないことが原則です。

## サブディレクトリ

- `ui/` 汎用 UI コンポーネント（Button, Typography 等）
- `hooks/` 汎用 React hook

## 配置の指針

- ドメインに依存しない → ここ
- 複数 feature で使うがドメインに依存する → `src/features/shared/`
- 1 feature 固有 → その feature 内に置く
