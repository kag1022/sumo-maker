# careerResult

力士記録（UI 上は「力士結果」）画面。終わったキャリアを「静かな表紙 → データベース」の
流れで読める画面として構成します。

## 責務

- 表紙（四股名 / 出身地・部屋 / 最高位 / 通算成績）の静かな提示
- プロフィール / 戦績 / 番付推移 / 対戦・宿敵などのタブ構成
- 保存判断への導線

## 主要ファイル

- `components/CareerResultPage.tsx` 画面本体
- `components/CareerEncyclopediaChapter.tsx` 百科事典形式の章
- `components/CareerPlaceChapter.tsx` 場所単位の章
- `components/CareerReviewChapter.tsx` 総括の章
- `components/CareerTrajectoryChapter.tsx` 番付推移の章
- `utils/` 表示整形

## 依存

- `src/logic/careerNarrative.ts` ストーリー合成
- `src/logic/careerRivalry.ts` 宿敵関係
- `src/logic/achievements.ts` 希少記録
- `src/logic/persistence/` 保存
