# Player Bout Explanation Preview Design

## Goal

`BoutFlowCommentary` の runtime-only 診断結果を、player bout の取組詳細プレビューとして表示するための設計メモ。

この段階では次を変更しない。

- DB schema
- worker protocol
- 永続化 payload
- App.tsx
- production 勝敗確率 / result roll / RNG
- route selection
- kimarite selection
- 全 NPC 取組解説

## Current Audit

### PlayerBoutDetail

`PlayerBoutDetail` は `src/logic/simulation/basho/types.ts` にあり、保存・表示に使える内容は次に限られる。

- `day`
- `result`
- `kimarite`
- `winRoute`
- opponent id / shikona / rank
- opponent style bias

ここには `OpeningPhase`, `ControlPhase`, `Transition`, `victoryFactorTags`, `hoshitoriContextTags`, `banzukeContextTags` は入っていない。

そのため、保存済み `CareerBashoDetail.bouts` だけから `BoutFlowCommentary` の本物の `COMPLETE_CONTEXT` を復元することはできない。

### CareerBashoDetail

`CareerBashoDetail` は `src/logic/persistence/shared.ts` で定義され、場所詳細として次を束ねる。

- `playerRecord`
- `rows`
- `bouts`
- `importantTorikumi`
- `banzukeDecisions`
- `diagnostics`

`importantTorikumi` は取組がなぜ組まれたか、または場所内で重要だったかを示す補助文脈であり、取組内の攻防説明ではない。

### Existing UI Surfaces

#### BashoDetailModal / DockedBashoDetailPane

`src/features/report/components/BashoDetailModal.tsx` と `DockedBashoDetailPane.tsx` は、保存済み記録の場所詳細を読む UI。

強み:

- `BashoDetailBody` を共有しているため、modal と docked pane の両方へ同じ設計を適用できる。
- すでに `detail`, `playerRecord`, `playerRank`, `importantTorikumi`, `banzukeDecisions` が揃っている。
- 読み物としての余白があり、選択中の一番だけを展開しても一覧性を壊しにくい。

弱み:

- 現状の `bouts` は保存済み detail なので、診断 snapshot が永続化されていない限り本物の commentary は出せない。

#### OfficialBoutResultList

`src/features/careerResult/components/OfficialBoutResultList.tsx` は、力士記録の場所別詳細で `東力士 / 東最終成績 / 決まり手 / 西最終成績 / 西力士` を表示する。

強み:

- 相撲協会公式風の一覧性に最も近い。
- 「東 / 決まり手 / 西」の骨格がすでに完成している。

弱み:

- 行内へ解説を常時入れると一覧性が壊れる。
- 初回からここへ `BoutFlowCommentary` を入れると、公式風の取組結果表と説明パネルの責務が混ざる。
- `CareerPlaceChapter` の tabs と組み合わせるため、状態管理を増やすと UI 影響範囲が広い。

#### 場所劇場

場所劇場は live / chaptered の観測体験に近く、取組の直後に解説を出すには魅力がある。

ただし初回対象としては不適。

- worker protocol に diagnostics を載せる必要が出やすい。
- runtime の観測 pacing と説明表示の責務が混ざる。
- production RNG / route / kimarite selection 非変更の確認範囲が広がる。

#### 力士記録の場所別詳細

`CareerPlaceChapter` の `OfficialBoutResultList` は将来の本命 UI。

ただし初回は `BashoDetailModal` でプレビューの読み方を確定し、表示 contract が固まってから `OfficialBoutResultList` の選択展開へ移す方がよい。

## Recommended First Target

最初の実装対象は `BashoDetailModal` の `RecordDetailLayout`。

理由:

- 既存の本割一覧の下に、選択中の一番だけの解説パネルを置ける。
- `DockedBashoDetailPane` も `BashoDetailBody` を使うため、横付け表示にも自然に反映できる。
- 公式風一覧を壊さず、読ませる UI として扱える。
- App.tsx、worker、DB を触らずに props contract を検討できる。

## Preview Interaction

初回 UI の形は次がよい。

1. 本割一覧の行を選択できるようにする。
2. 選択中の行だけ `aria-selected` と視覚 highlight を持つ。
3. 一覧の下、または右カラムの上部に `取組解説` パネルを出す。
4. パネルの上段は公式風に `東 / 決まり手 / 西` の小さな結果帯を出す。
5. 下段に次を表示する。
   - 短評
   - 勝敗要因ラベル
   - 展開説明
   - 星取文脈
   - 番付文脈

行内には長文を入れない。行内は選択状態と必要なら「解説」アイコンだけに留める。

## Data Contract

UI に渡す最小 props は、永続化を始める前なら次の形がよい。

```ts
interface PlayerBoutExplanationPreview {
  readonly bashoSeq: number;
  readonly day: number;
  readonly commentary: BoutFlowCommentary;
}

interface BashoDetailBodyProps {
  readonly playerBoutExplanationPreviews?: readonly PlayerBoutExplanationPreview[];
}
```

キーは `bashoSeq + day` を基本にする。player は 1 日 1 番なので day key で足りる。

`PlayerBoutDetail` に直接 `commentary` を追加しない。保存 schema と worker protocol の境界が曖昧になり、runtime-only の前提が崩れる。

## Safe Runtime-Only Plan

安全に出せる案:

- Logic Lab / diagnostic run の中で `BoutFlowDiagnosticSnapshot` から `BoutFlowCommentary` を生成する。
- UI 側には保存済み detail とは別の optional preview map として渡す。
- preview が存在する行だけ解説パネルを表示する。
- preview がない行では「解説なし」ではなく、パネル自体を出さない。

これなら production の保存済み career 読み返しには影響しない。

## Persistence Plan

永続化が必要になる案:

- 保存済み記録の全場所で後から取組解説を読みたい。
- skip_to_end 後も解説を復元したい。
- アーカイブで検索・比較・抽出に使いたい。

この場合は `PlayerBoutDetail` に混ぜず、別 row として扱う方がよい。

候補:

```ts
interface PlayerBoutExplanationRow {
  readonly careerId: string;
  readonly bashoSeq: number;
  readonly day: number;
  readonly contractVersion: BoutFlowCommentaryContractVersion;
  readonly commentary: BoutFlowCommentary;
  readonly snapshot?: BoutFlowDiagnosticSnapshot;
}
```

ただしこれは DB schema、append chunk、detail loading、worker protocol を伴うため、このタスクでは実装しない。

## Avoid

避けるべき案:

- `PlayerBoutDetail` に commentary を直接追加する。
- `OfficialBoutResultList` の全行に常時説明文を出す。
- `importantTorikumi.summary` を取組解説として代用する。
- `winRoute + kimarite` だけから Opening / Control を推測して表示する。
- 場所劇場へ先に入れて worker message を増やす。
- 全 NPC 取組まで説明対象に広げる。

特に `winRoute + kimarite` だけの推測は、完成形 contract の価値を壊す。`COMPLETE_CONTEXT` がないなら表示しない方が正しい。

## First Implementation Scope

最初に実装するなら対象は `BashoDetailModal.tsx`。

必要 props:

- `playerBoutExplanationPreviews?: readonly PlayerBoutExplanationPreview[]`
- `selectedBoutDay?: number`
- `onSelectedBoutDayChange?: (day: number) => void`

ただし、local UI state だけで閉じるなら `selectedBoutDay` は `RecordDetailLayout` 内部 state でよい。

変更ファイル候補:

- `src/features/report/components/BashoDetailModal.tsx`
- `src/features/report/components/DockedBashoDetailPane.tsx`
- `src/features/report/components/BoutExplanationPreviewPanel.tsx`
- `src/features/report/components/BoutExplanationPreviewPanel.module.css`
- `src/features/report/README.md`

`OfficialBoutResultList.tsx` は第 2 段階。ここでは選択行の展開だけを足し、公式風の列構造は変えない。

## Verification

初回実装時の確認項目:

- preview props 未指定で既存 UI が完全に同じ表示になる。
- preview がある day だけ選択時に解説パネルが出る。
- `東 / 決まり手 / 西` の一覧性が崩れない。
- `BoutFlowCommentary.materialKeys` が表示ではなく diagnostics に残る。
- モバイル幅で短評、ラベル、展開説明が重ならない。
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run doc:audit`
- `npx tsx scripts/diagnostics/bout_flow_commentary_generator.ts`

## Decision

このタスクでは UI component は追加しない。

理由は、現行保存済み detail から `COMPLETE_CONTEXT` を復元できないため。ここで mock 表示を作ると、実データで出せるように見える UI だけが先行する。

次の安全な実装は、diagnostic run から `PlayerBoutExplanationPreview[]` を明示的に渡せる dev-only 経路を作った後、`BashoDetailModal` の `RecordDetailLayout` に opt-in panel を追加すること。
