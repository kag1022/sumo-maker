# logic/banzuke

番付編成・昇降格・委員会ロジックです。ここは merit 判定に集中し、人口流量や worker 進行の都合を
直接持ち込みません。

## 責務

- 番付 proposal の生成
- 委員会 review と rule 適用
- 昇降格の merit-first 判定
- rank スケールと番付構造の提供

## 責務ではないもの

- worker の進行制御
- 人数合わせのための上位昇格
- `LeagueState` の二重管理
- narrative / event 生成

## サブディレクトリ

| パス | 役割 |
|------|------|
| `committee/` | 番付編成委員会ロジック |
| `optimizer/` | 番付最適化 |
| `population/` | Jonokuchi / 前相撲寄りの母集団補助 |
| `providers/` | rank 情報の供給源 |
| `rules/` | 昇降格ルール定義 |
| `scale/` | rank スケール変換 |

## 重要ファイル

- `index.ts` 公開エントリ
- `types.ts` 型定義
- `committee/composeNextBanzuke.ts` 番付編成の中核

## simulation との境界

- simulation 側は `LeagueState` を source of truth として snapshot を持つ
- banzuke 側は merit 判定の結果を返し、headcount 補充の責務を持たない
- population 調整が必要でも、幕下以上の昇降を枠埋め目的で決めない
- 下位番付は `scaleSlots` で渡された runtime の可変 headcount を rankIndex 解決に使う
- `BanzukeDecisionLog.lowerMovementDiagnostics` は成績移動、新弟子流入圧、空き圧、境界投影を分けて記録する
- 序ノ口・序二段下位の負け越し上昇は人口流量そのものではなく、runtime scale へ投影された結果として理由コードで説明する

## テスト

- `scripts/tests/modules/banzuke.ts`
- `scripts/tests/current/banzuke.ts`
- `npm run report:banzuke:quick`
- `npm run report:banzuke:quantile`
- `npm run report:banzuke:validation`
- `npm run report:banzuke:lower-movement`
