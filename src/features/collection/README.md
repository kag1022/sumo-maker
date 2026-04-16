# collection

資料館（UI 上は「力士コレクション」）画面。プレイを通じて解放された希少記録・
実績・決まり手を相撲世界の理解として蓄積して読み返せる場所です。

## 責務

- カテゴリ別の収集状況表示
- 未解放要素のヒント提示

## 主要ファイル

- `components/CollectionScreen.tsx` 画面本体

## 依存

- `src/logic/achievements.ts` 実績・希少度
- `src/logic/kimarite/` 決まり手
- `src/logic/persistence/` 解放状況の保存
