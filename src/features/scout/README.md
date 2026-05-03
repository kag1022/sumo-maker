# scout

新弟子設計（UI 上は「スカウト」）の画面を構成する feature です。
プレイヤーがキャリア開始前に決める初期条件をここに集約します。

## 責務

- 四股名、入門年齢、身長体重、入門経路、気質、体格、所属部屋の選択 UI
- 観測スタンスを選ばせ、今回の一代を読む視点を `SimulationRunOptions` へ渡す
- 選択内容を `src/logic/initialization.ts` / `src/logic/scout/` が要求する形へ整形
- キャリア開始に必要な生成札の残数と回復時間を表示
- 確定時に `simulation` feature の開始 API を呼ぶ

## 主要ファイル

- `components/ScoutScreen.tsx` 画面本体

## 依存

- `src/logic/scout/` 新弟子抽選・プール
- `src/logic/career/analysis.ts` 観測スタンス定義
- `src/logic/initialization.ts` 初期ステータス生成
- `src/logic/naming/` 四股名生成
- `src/logic/oyakata/` 部屋情報

## 非依存

- 他 feature からは import しません。遷移は `app/AppShell.tsx` が制御します。
