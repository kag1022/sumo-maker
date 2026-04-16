# logicLab

開発用の preset + seed + model 検証画面です。プロダクション体験からは外れた
検証ツール層で、実キャリアを再現可能に確認するために使います。

## 責務

- preset（`RANDOM_BASELINE` など）と seed を固定したキャリア再現
- 進行ログの追跡と差分確認
- 検証用の model 切り替え（現行主対象は `unified-v3-variance`）

## 主要ファイル

- `components/LogicLabScreen.tsx` 画面本体
- `presets.ts` 検証用 preset 定義
- `runner.ts` 検証キャリアの実行
- `store/` 検証状態管理
- `types.ts` 型定義

## 依存

- `src/logic/simulation/` エンジン
- `src/logic/careerSeed.ts` 決定論的 seed

## 注意

- 通常プレイには露出しない画面です。
- ここでの発見は、原則として `scripts/tests/` か `scripts/reports/` に落としてから
  恒久的な検証にしてください。
