# logic/build

キャリア開始時の能力値・物語選択の組み立てを行います。

- `buildLab.ts` 初期 stats の組み立て
- `narrativeChoices.ts` 入門時の物語分岐候補

## 設計ルール

- `BuildSpecVNext` に `aptitudeTier` がある場合はそれを正とし、build 側で再抽選しない
- scout / narrative 由来の style は tactics に反映し、初期状態から勝ち筋の個性を持たせる
- build は UI 表示都合を知らない。候補の見せ方や文言は feature 側で扱う
