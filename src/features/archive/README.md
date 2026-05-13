# features/archive

資料館のコレクション閲覧画面です。保存済みキャリアから解放された人物・親方・決まり手・実績を読むための UI を担当します。

- `ArchiveCollectionScreen.tsx` 資料館の一覧、絞り込み、選択状態、表示カード

## 設計ルール

- 収集条件や称号判定は `src/logic/archive/` と `src/logic/career/` に置く
- 永続化の読み書きは persistence API 経由にする
- 新しいコレクション種別を足す場合は、表示だけでなく unlock 判定と保存済みデータの読み方を同時に確認する
