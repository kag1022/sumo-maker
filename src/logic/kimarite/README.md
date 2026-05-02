# logic/kimarite

決まり手（勝ち方）のカタログと選定ロジック。

- `catalog.ts` 決まり手カタログ
- `repertoire.ts` 力士ごとのレパートリー。型の主軸を保ちつつ、準主軸と状況技を持たせる
- `selection.ts` 取組結果から決まり手を選ぶ。route と style を守りながら、履歴偏重を圧縮して多様性を確保する

## 設計ルール

- 決まり手のリアリティは「珍しい技を増やす」ではなく、型ごとの勝ち筋と反復の納得感で作る
- `battle.ts` から渡る route は勝負内容の制約として扱い、無関係な route の技を混ぜない
- レパートリーは固定リストではなく、キャリア進行で common / uncommon の技を少しずつ獲得できる
- report では unique 数、top1/top3 偏重、rare/extreme、bucket 別の偏りを同時に見る
