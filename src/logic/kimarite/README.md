# logic/kimarite

決まり手（勝ち方）のカタログと選定ロジック。

- `catalog.ts` 決まり手カタログ
- `aliases.ts` 決まり手名の表記揺れ正規化
- `realdata.ts` 日本相撲協会の決まり手ランキングを使った rarity / weight 補正
- `repertoire.ts` 力士ごとのレパートリー。型の主軸を保ちつつ、準主軸と状況技を持たせる
- `selection.ts` 取組結果から決まり手を選ぶ。route と style を守りながら、履歴偏重を圧縮して多様性を確保する
- `signature.ts` 通算決まり手から代表技を選ぶ。rare / extreme は最低出現回数と rarity penalty を通す
- `rareEncounters.ts` 得意技とは別枠で珍しい決まり手遭遇を集計する

## 設計ルール

- 決まり手のリアリティは「珍しい技を増やす」ではなく、型ごとの勝ち筋と反復の納得感で作る
- `battle.ts` から渡る route は勝負内容の制約として扱い、無関係な route の技を混ぜない
- rarity は実データ頻度を基準にする。公式期間 0 回の技は `EXTREME` / epsilon weight とし、代表技にはしない
- レパートリーは固定リストではなく、キャリア進行で common / uncommon の技を少しずつ獲得できる
- rare / extreme は発生自体をゼロにしないが、代表技にはより高い最低出現回数を要求する
- report では unique 数、top1/top3 偏重、rare/extreme、bucket 別の偏りを同時に見る
