# report

保存済み記録（UI 上は「保存レコード」）画面。見届けた力士人生を一覧し、後から
読み返すための私設アーカイブです。

## 責務

- 保存済みキャリアの一覧と殿堂（Hall of Fame）提示
- キャリア単体の詳細（年表・番付・勝敗履歴・実績）読み返し
- 場所単位の詳細モーダル

## 主要ファイル

- `components/ArchiveScreen.tsx` アーカイブ画面本体
- `components/HallOfFameGrid.tsx` 殿堂グリッド
- `components/HoshitoriTable.tsx` 星取表
- `components/BanzukeReviewTab.tsx` 番付タブ
- `components/RankTrajectoryTab.tsx` 番付推移タブ
- `components/RecordTab.tsx` 戦績タブ
- `components/ReportAchievementsTab.tsx` 実績タブ
- `components/AchievementView.tsx` 実績詳細
- `components/BashoDetailModal.tsx` 場所詳細モーダル
- `components/DockedBashoDetailPane.tsx` 横付け版場所詳細
- `utils/` 表示整形

## 依存

- `src/logic/persistence/` 保存データ読み込み
- `src/logic/achievements.ts` 実績
- `src/logic/banzuke/` 番付表示
