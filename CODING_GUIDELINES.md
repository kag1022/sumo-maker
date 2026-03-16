# コーディング規約 (Sumo Maker)

本ドキュメントは、コードベースの一貫性を維持するためのルールです。
コーディングエージェント・開発者ともにこのルールに従ってください。

---

## 1. プロジェクト構造

```
src/
├── app/        # アプリのエントリポイント・シェル・ルーティング
├── features/   # 機能ごとのUI（components/, utils/, store/ を内包）
├── logic/      # ドメインロジック・シミュレーション（React非依存）
└── shared/     # 共有UIコンポーネント（Button, Card 等）
```

- **`logic/`にReact依存コードを置かない**（`import React` 禁止）
- **`features/`の各機能は独立に保つ**（feature間の直接importは避ける）
- **`shared/`は汎用UIコンポーネントのみ**（ドメインロジックを含めない）

---

## 2. TypeScript 規約

### エクスポート
- **named export (`export const`) を使う**。`export default` は禁止。
- 関数は **arrow function** で定義する。

```typescript
// ✅ 良い例
export const calculateBattleResult = (...): Result => { ... };

// ❌ 悪い例
export default function calculateBattleResult(...) { ... }
```

### 型定義
- 型は `PascalCase`（例: `RikishiStatus`, `BoutContext`）
- Union型のリテラルは `UPPER_SNAKE_CASE`（例: `'PUSH' | 'GRAPPLE'`）
- `interface` と `type` の使い分け:
  - オブジェクト構造 → `interface`
  - Union型/Utility型 → `type`

### 定数
- 定数オブジェクトは `UPPER_SNAKE_CASE`（例: `CONSTANTS`, `ENEMY_SEED_POOL`）
- マジックナンバーは避け、名前付き定数を使う

---

## 3. React 規約

### import方式
- **`import React from 'react'`** を使い、hooks は `React.useState` 形式で呼ぶ。
- 分割importは使わない（`import { useState } from 'react'` は禁止）。

```tsx
// ✅ 良い例
import React from 'react';
const [value, setValue] = React.useState(0);
const memo = React.useMemo(() => ..., []);

// ❌ 悪い例
import React, { useState, useMemo } from 'react';
```

### コンポーネント定義
- **`React.FC<Props>` + arrow function** で定義する。

```tsx
export const MyComponent: React.FC<MyComponentProps> = ({ prop1, prop2 }) => {
  return <div>...</div>;
};
```

---

## 4. コメント規約

- **すべてのコメントは日本語で書く**
- 関数のドキュメントは JSDoc 形式を推奨（必須ではない）
- TODO/FIXME は英語OK（検索性のため）

```typescript
// ✅ 良い例
/** 勝敗判定ロジック */
export const calculateBattleResult = (...) => { ... };

// 基礎能力の総合値を計算
const myTotal = Object.values(rikishi.stats).reduce((a, b) => a + b, 0);

// ❌ 悪い例（英語コメント）
// Calculate the total of base abilities
```

---

## 5. フォーマット規約

| 項目 | ルール |
|------|--------|
| インデント | **2スペース** |
| 末尾改行 | ファイル末尾に **改行1つ** |
| 空行 | 連続空行は **最大1行** |
| 文字列クォート | ロジック層(`*.ts`) → シングルクォート / UI層(`*.tsx`) → ダブルクォート |
| セミコロン | **あり** |
| 行末スペース | **なし** |

---

## 6. 命名規約

| 対象 | 形式 | 例 |
|------|------|-----|
| ファイル（コンポーネント） | PascalCase | `ReportScreen.tsx` |
| ファイル（ロジック） | camelCase | `battleResult.ts` |
| 変数・関数 | camelCase | `resolveWinProbability` |
| 定数 | UPPER_SNAKE_CASE | `CONSTANTS`, `DEFAULT_BODY_METRICS` |
| 型・インターフェース | PascalCase | `RikishiStatus`, `BoutContext` |
| Reactコンポーネント | PascalCase | `ReportScreen`, `Button` |
| CSSクラス | kebab-case | `surface-panel`, `metric-card` |

---

## 7. ESLint

ESLint設定（`eslint.config.js`）で以下のルールが `warn` レベルで有効です:

- `indent`: 2スペース
- `no-multiple-empty-lines`: 連続空行は最大1行
- `eol-last`: ファイル末尾に改行
- `@typescript-eslint/no-unused-vars`: 未使用変数（`_`プレフィックスは除外）

ビルド前に `npx eslint src/` を実行して警告を確認してください。
