# src/logic

UI 非依存の相撲ドメインロジックをまとめる層です。
`import React` を禁止とし、Node からも（scripts/ からも）呼べることを維持します。

## モジュール一覧

### シミュレーション中核

| パス | 役割 |
|------|------|
| `simulation/` | キャリア進行エンジン（取組・能力・怪我・番付・引退・realism）。詳細は [simulation/README.md](./simulation/README.md) |
| `banzuke/` | 番付編成・昇降格・委員会ロジック。詳細は [banzuke/README.md](./banzuke/README.md) |
| `battle.ts` | 1 番単位の勝敗判定 |
| `growth.ts` | 能力の成長・平均回帰・減衰 |
| `traits.ts` | 特性の獲得と分類 |
| `styleProfile.ts` | 型プロファイル |
| `careerSeed.ts` | 再現用 seed |
| `careerRivalry.ts` | 対戦相手・宿敵関係の抽出 |
| `careerNarrative.ts` | キャリア物語の合成 |
| `achievements.ts` | 希少記録と希少度 |

### 周辺モジュール

| パス | 役割 |
|------|------|
| `build/` | キャリア開始時の stats 組み立て |
| `calibration/` | 校正データと検証ユーティリティ |
| `career/` | キャリア phase 判定 |
| `catalog/` | NPC・敵テンプレート・部屋定義 |
| `economy/` | 経済系シミュレーション |
| `kimarite/` | 決まり手 |
| `naming/` | 四股名生成 |
| `observer/` | 観測アップグレード |
| `oyakata/` | 部屋（親方）定義 |
| `persistence/` | IndexedDB（Dexie）永続化 |
| `ranking/` | 番付 rank 値換算 |
| `research/` | 観測メタゲームの研究テーマ |
| `scout/` | 新弟子抽選プール |
| `style/` | 視覚表現（色・見た目） |
| `telemetry/` | 利用計測 |

### グローバル

| ファイル | 役割 |
|----------|------|
| `models.ts` | 共通の型・interface・enum |
| `constants.ts` | グローバル定数 |
| `bashoLabels.ts` | 場所年月など、画面をまたいで使う相撲ドメイン表示ラベル |
| `balance.ts` | バランス調整の倍率と hook |
| `initialization.ts` | 新弟子の初期化 |

## 共通ルール

- React 非依存。`import React` を書かないこと。
- feature からは logic を自由に import してよいが、逆方向（logic → feature）は禁止。
- 大きなモジュール（ディレクトリ単位）には各自の README を置き、
  責務・入口関数・副作用の有無・テスト場所を短く書いてください。
