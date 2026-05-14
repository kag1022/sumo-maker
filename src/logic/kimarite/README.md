# logic/kimarite

決まり手（勝ち方）のカタログと選定ロジック。

- `catalog.ts` 決まり手カタログ
- `aliases.ts` 決まり手名の表記揺れ正規化
- `realdata.ts` 日本相撲協会の決まり手ランキングを使った rarity / weight 補正
- `repertoire.ts` 力士ごとのレパートリー。型の主軸を保ちつつ、準主軸と状況技を持たせる
- `finishRoute.ts` 勝敗確定後の抽象的な勝ち筋（FinishRoute）選択。production と diagnostics が同じ候補順・重み式を共有する
- `selection.ts` 取組結果から決まり手を選ぶ。route と style を守りながら、履歴偏重を圧縮して多様性を確保する
- `engagement.ts` 勝敗確定後の主導権・取組形態。`BoutFlowModel` では ControlPhase の現行 predecessor として扱う
- `signature.ts` 通算決まり手から代表技を選ぶ。rare / extreme は最低出現回数と rarity penalty を通す
- `rareEncounters.ts` 得意技とは別枠で珍しい決まり手遭遇を集計する

## 設計ルール

- 決まり手のリアリティは「珍しい技を増やす」ではなく、型ごとの勝ち筋と反復の納得感で作る
- `BoutFlowModel` の完成形語彙では、`WinRoute` が FinishRoute、`KimariteOutcomeResolution` と catalog metadata が Kimarite 層に対応する。勝敗要因・星取文脈・番付文脈は kimarite selector ではなく explanation 側で結合する
- `BoutEngagement.phase` は理想 ControlPhase そのものではない。診断では `simulation/combat/controlPhaseAdapter.ts` を通し、`ControlPhasePredecessor` と `ControlPhaseCandidate` を分けて読む
- 現行 production path は変更しない。PreBoutPhase route-bias helper は診断・実験用であり、それ単体を本番の勝ち筋制御にしない
- production の FinishRoute 選択では `routeMultipliers` を渡さない。実験用 multiplier は diagnostics だけで使う
- `resolveFinishRouteCandidates` は parity guard 用の純粋な候補列であり、production の抽選は `resolveFinishRoute` が `rng()` を 1 回だけ消費して行う
- `battle.ts` から渡る route は勝負内容の制約として扱い、無関係な route の技を混ぜない
- rarity は実データ頻度を基準にする。公式期間 0 回の技は `EXTREME` / epsilon weight とし、代表技にはしない
- レパートリーは固定リストではなく、キャリア進行で common / uncommon の技を少しずつ獲得できる
- rare / extreme は発生自体をゼロにしないが、代表技にはより高い最低出現回数を要求する
- report では unique 数、top1/top3 偏重、rare/extreme、bucket 別の偏りを同時に見る
