# logic/scout

新弟子のガチャ・選択肢生成。`src/features/scout/` がこの結果を受けて
`initialization.ts` に渡します。

- `choices.ts` 選択肢の生成
- `gacha.ts` 初期素質、入門経路、体格、取口のガチャ抽選
- `populations.ts` realism report 用の観測母集団生成。`player-scout-default` は本編 scout と同じ未編集候補、`historical-like-career` は historical target 比較専用。historical-like は `historical-like-v1` / `historical-like-v2-*` の preset を持つ。

## 設計ルール

- `aptitudeTier` は入門経路からの固定値ではなく、経路ごとの重み付き抽選で決める
- 高校・大学・実績持ち・地方出身の差は、完全な序列ではなく成功確率の違いとして扱う
- scout draft で出た素質は build spec へ渡し、初期能力組み立て時に再抽選しない
- ビルドモードの `growthType` / `preferredStyle` / `entryArchetype` / `talentProfile` は、直接能力値ではなく成長曲線・取口・入口番付・素質帯の前提として解決する
- 付出系 `entryArchetype` を明示した場合は、制度整合性を優先して大学・学生横綱相当の入口として扱う
- 取口は scout の表示要素ではなく、初期 tactics / style identity に反映される前提で扱う
- `historical-like-career` は calibration 専用であり、本編 scout UI や候補体験へ直接流用しない
