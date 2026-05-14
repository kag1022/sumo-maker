# careerResult

力士記録（UI 上は「力士結果」）画面。終わったキャリアを「静かな表紙 → データベース」の
流れで読める画面として構成します。

## 責務

- 表紙（四股名 / 出身地・部屋 / 最高位 / 通算成績）の静かな提示
- 選択された観測スタンスに対する判定、主要指標、理由の提示
- プロフィール / 戦績 / 番付推移 / 対戦・宿敵などのタブ構成
- detail build 完了時に付与された観測点の提示
- 保存済み場所データから所属部屋、同部屋力士、同一門の関係性を通常UI向けに提示
- 保存推奨理由、自動タグ候補、手動保存タグによる保存判断への導線

保存は報酬獲得の条件ではありません。観測点は detail build 完了時に付与され、
保存は分類・再読・比較のために行います。

## 主要ファイル

- `components/CareerResultPage.tsx` 画面本体
- `components/CareerEncyclopediaChapter.tsx` 百科事典形式の章
- `components/CareerPlaceChapter.tsx` 場所単位の章
- `components/CareerReviewChapter.tsx` 総括の章
- `components/CareerTrajectoryChapter.tsx` 番付推移の章
- `components/OfficialBoutResultList.tsx` 公式風の取組結果一覧。player bout に保存済み `BoutFlowCommentary` がある場合は決まり手下の「取組解説」ボタンから詳細を開く
- `utils/` 表示整形

## 依存

- `src/logic/careerNarrative.ts` ストーリー合成
- `src/logic/career/analysis.ts` 観測スタンス判定と保存推奨
- `src/logic/careerRivalry.ts` 宿敵関係
- `src/logic/achievements.ts` 希少記録
- `src/logic/persistence/` 保存
