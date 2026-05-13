# features/observation

観測導線の旧/予備領域です。
現行の通常導線は `src/features/observationBuild/` が担当します。

## 現状

- `components/` と `utils/` の空ディレクトリのみがあります。
- 新規実装をここへ追加する前に、`observationBuild` に閉じるべきか、新 feature として切るべきかを判断します。

## 注意点

- 旧 Scout / observationStance 系の通常導線への再混入を避ける。
- 観測テーマや追加ビルドの domain logic は `src/logic/archive/` 側を優先する。
