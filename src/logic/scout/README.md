# logic/scout

新弟子のガチャ・選択肢生成。`src/features/scout/` がこの結果を受けて
`initialization.ts` に渡します。

- `choices.ts` 選択肢の生成
- `gacha.ts` 初期素質、入門経路、体格、取口のガチャ抽選

## 設計ルール

- `aptitudeTier` は入門経路からの固定値ではなく、経路ごとの重み付き抽選で決める
- 高校・大学・実績持ち・地方出身の差は、完全な序列ではなく成功確率の違いとして扱う
- scout draft で出た素質は build spec へ渡し、初期能力組み立て時に再抽選しない
- 取口は scout の表示要素ではなく、初期 tactics / style identity に反映される前提で扱う
