# 目的

これまでの幕下〜十両境界診断を整理し、現時点で分かったこと、分からないこと、次に必要な実装をまとめる。

今回はゲーム本体ロジックを変更しない。
新しい分析も行わない。
既存レポートを統合して、判断用の最終整理を作る。

# 参照するレポート

- docs/realdata_integration/sekitori_boundary_realdata_summary.md
- docs/realdata_integration/sekitori_boundary_sim_vs_real.md
- docs/realdata_integration/sekitori_boundary_zone_record_breakdown.md
- docs/realdata_integration/makushita_upper5_by_rank_number.md
- docs/realdata_integration/sim_makushita_upper5_by_rank.md
- docs/realdata_integration/sim_vs_real_makushita_upper5_by_rank.md
- docs/realdata_integration/world_makushita_upper5_by_rank.md
- docs/realdata_integration/world_vs_real_makushita_upper5_by_rank.md

# 作成するもの

docs/realdata_integration/sekitori_boundary_final_assessment.md

# 書くこと

## 1. 全体結論

- 幕下〜十両境界は現時点で修正対象か
- 実データ側で分かったこと
- sim側で分かったこと
- まだ比較不能なこと

## 2. 実データ側の確定KPI

以下を整理する。

- Makushita_Upper_5 4-3 昇進率
- Makushita_Upper_5 5-2 昇進率
- Makushita_Upper_5 6-1 昇進率
- Makushita_Upper_5 7-0 昇進率
- 幕下1〜5枚目 rankNumber × record 別昇進率
- Juryo_Low 負け越し降格率
- 十両下位勝ち越し率

## 3. sim側KPIとの比較

以下を整理する。

- sim 5勝以上昇進率 77.3%
- real Makushita_Upper_5 5勝以上昇進率 78.3%
- この比較では大きな乖離はない
- real 全Upper 19.3% とは定義が違うため比較してはいけない

## 4. sim側 rankNumber別比較が不成立だった理由

以下を書く。

- プレイヤー単体追跡ではサンプル不足
- 全NPC遷移抽出も Records: 0
- createSimulationEngine はNPCの fromRank → toRank 遷移を返さない
- npcBashoRecords だけでは遷移を復元できない
- したがって現状では同粒度比較不可

## 5. 現時点で修正すべきでないこと

- 幕下上位5勝以上の昇進率を下げる修正
- rankNumber別 boundaryPressure の即時導入
- movementBlendRatio の導入
- 実データhintの直接適用

## 6. 次に本当に必要なこと

以下のどちらかを提案する。

### Option A: 観測口追加

- composeNextBanzuke か simulation.worker に、全NPCの banzuke transition log を出す
- fromRank, toRank, wins, losses, absences, rikishiId を保存
- dev-only / debug-only で本番挙動に影響しないようにする

### Option B: 十両下位勝ち越し率の診断

- sim 35.7% vs real 54.8% の差を深掘りする
- 十両下位NPCの能力分布
- 取組相手強度
- 十両下位の対戦設計
- 十両滞留・陥落者の質

## 7. 推奨

最優先は Option B。
理由:
- 幕下上位5勝以上昇進率は定義一致後に大きな乖離が見えない
- 一方、十両下位勝ち越し率はまだ明確な乖離がある
- B tier 幕下吸着にも、十両下位側の強さ・滞留構造が関係する可能性がある

# 完了条件

- sekitori_boundary_final_assessment.md が作成されている
- 既存ゲーム本体は変更していない
- 新しいデータ取得はしていない