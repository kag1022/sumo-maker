# scripts

コマンドラインから走らせる決定論テスト・レポート・補助ツールを置きます。
`src/logic/` を React 非依存のまま直接利用することを前提にしています。

## サブディレクトリ

### `tests/`

sim tests の runner とテスト本体。

- `run_sim_tests.cjs` 実行エントリ
- `modules/` 領域別のテスト（banzuke, simulation, gameplay など）
- `current/` 現行仕様向けの sim tests
- `compat/` 互換確認専用（新規テストはここに足さない）
- `shared/` 共通 helper

新規テストは `current/` か `modules/` に追加してください。

### `reports/`

分布確認や Monte Carlo 分析のレポート生成。

- quick 系: `report:banzuke:quick` / `report:realism:quick` など
- acceptance: `report:realism:acceptance`（重い）
- 校正: `report:calibration`

### `shared/`

scripts 間共有の補助。

- `ensure_simtests_build.cjs` `.tmp/sim-tests/` の再利用管理

## その他

- `remove_bg.cjs` 画像処理ユーティリティ

## 出力先

- Markdown: `docs/balance/`
- JSON: `.tmp/`

## 詳細なテスト運用

ルート `README.md` の「テスト運用」「リアリズム検証フロー」節を参照してください。
