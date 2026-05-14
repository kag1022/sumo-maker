# report

保存済み記録（UI 上は「保存レコード」）画面。見届けた力士人生を一覧し、後から
読み返すための私設アーカイブです。

## 責務

- 保存済みキャリアの一覧と殿堂（Hall of Fame）提示
- キャリア単体の詳細（年表・番付・勝敗履歴・実績）読み返し
- 場所単位の詳細モーダル
- 観測スタンス、保存タグ、自動タグ、珍記録、怪我、宿敵などによる資料館フィルタ
- 保存済み二人比較、番付推移比較、勝率推移比較、根拠付き比較コメント
- 類似キャリア検索と類似理由表示
- 保存済み母集団内での世代比較と宿敵カード

## 主要ファイル

- `components/ArchiveScreen.tsx` アーカイブ画面本体。保存一覧、分析フィルタ、二人比較、類似検索、世代/宿敵読みを持つ
- `components/HallOfFameGrid.tsx` 殿堂グリッド
- `components/HoshitoriTable.tsx` 星取表
- `components/BanzukeReviewTab.tsx` 番付タブ
- `components/RankTrajectoryTab.tsx` 番付推移タブ
- `components/RecordTab.tsx` 戦績タブ
- `components/ReportAchievementsTab.tsx` 実績タブ
- `components/AchievementView.tsx` 実績詳細
- `components/BashoDetailModal.tsx` 場所詳細モーダル
- `components/DockedBashoDetailPane.tsx` 横付け版場所詳細
- `components/BoutExplanationPreviewPanel.tsx` player 取組解説パネル。保存済み `PlayerBoutDetail.boutFlowCommentary` を優先し、dev 固定 seed preview も同じ表示 contract で確認できる
- `utils/` 表示整形

## 依存

- `src/logic/persistence/` 保存データ読み込み
- `src/logic/career/analysis.ts` 資料館フィルタと比較の派生分析
- `src/logic/achievements.ts` 実績
- `src/logic/banzuke/` 番付表示
