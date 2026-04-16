# bashoHub

場所の進行をリアルタイムで観る「劇場」画面です。シミュレーション中の取組を
一番ずつ可視化し、観戦体験として楽しめるようにします。

## 責務

- 進行中の場所の取組を時系列で表示
- 勝敗・決まり手・番付の強調演出

## 主要ファイル

- `components/BashoTheaterScreen.tsx` 画面本体
- `utils/` 表示整形ヘルパー

## 依存

- `src/features/simulation/` 進行状態の購読
- `src/logic/kimarite/` 決まり手表示
- `src/logic/banzuke/` 番付表示
