# 番付遷移 Top5 予測 デモ（成績条件付き）

平成期 (1989/01–2019/03) の `rank_movement_with_record` から集計した
経験的条件付き分布 `P(next_label | current_label, wins, losses, absences)` を使い、
入力した「現番付ラベル + 場所成績」に対する次場所の番付候補 Top5 を確率付きで表示。

## セットアップ

データ JSON は `sumo-db/data/analysis/banzuke_transition_heisei.json`。
SQLite DB を更新したら再生成:

```
npm run predict:export
```

## 使い方

```
npm run predict:demo -- 東横綱1枚目 13-2
npm run predict:demo -- 東前頭5枚目 10-5
npm run predict:demo -- 東前頭5枚目 4-11
npm run predict:demo -- 西大関1枚目 5-5-5     # 途中休場
npm run predict:demo -- 東幕下1枚目 4-3
npm run predict:demo -- --file my_basho.txt   # 1 行 "ラベル 成績"
npm run predict:demo -- --top 10 東小結1枚目 8-7
npm run predict:demo -- --list-labels
```

- ラベル形式: 平成期データそのまま（例: `東横綱1枚目`, `西前頭16枚目`,
  `東幕下55枚目張出`）。"枚目" 付き完全形。
- 成績形式: `<勝>-<負>` または `<勝>-<負>-<休>`（例: `8-7`, `13-2`, `5-5-5`, `0-0-15`）。
- 成績を省略するとラベル周辺分布で予測。

## 出力例

```
入力: 東小結1枚目  8-7  (n=36, 出典: byRecord[8-7-0])
   1. 東小結1枚目            47.2%  (n=17)
   2. 西関脇1枚目            30.6%  (n=11)
   3. 東関脇1枚目            16.7%  (n=6)
   4. 西小結1枚目             5.6%  (n=2)
```

## モデル

- 学習なし。`from_basho_code <= 201903` かつ `to_basho_code <= 201903` の
  `rank_movement_with_record` を `(from_banzuke_label, source_wins, source_losses, source_absences)`
  でグルーピングし、`to_banzuke_label` の出現頻度を確率に正規化。
- JSON には 3 階層を保存:
  - `byRecord["W-L-A"]` … 完全条件
  - `byWinLoss["W-L"]`  … 休場マージナル
  - `marginal`          … 成績マージナル（=ラベルのみ）
- CLI フォールバック: 該当セルが `n<5` の場合
  `byRecord → byWinLoss → marginal` の順に降格して採用。

## 限界と今後

- 力士本人の経歴・キャリア軌道は考慮しない。
- 八百長・引退・関取定員などの構造要因は黙示的にデータに混入。
- 今後 `src/logic/banzuke/composeNextBanzuke.ts` の決定論的ルールに、
  この経験的分布を「揺らぎ／優先順位タイブレーク」として注入することで
  番付変動シミュレーションのリアリティ向上に応用可能。
