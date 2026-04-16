# logic/banzuke

番付編成・昇降格・委員会ロジック。取組編成の前提となる rank 構造を提供します。

## サブディレクトリ

| パス | 役割 |
|------|------|
| `committee/` | 番付編成委員会ロジック |
| `optimizer/` | 番付最適化 |
| `population/` | 階層ごとの母集団管理 |
| `providers/` | rank 情報の供給源 |
| `rules/` | 昇降格ルール定義 |
| `scale/` | rank スケール変換 |

## 重要ファイル

- `index.ts` 公開エントリ
- `types.ts` 型定義

## テスト

- `scripts/tests/modules/banzuke.ts`
- `scripts/tests/current/banzuke.ts`
- `npm run report:banzuke:quick` / `:quantile` / `:validation`
