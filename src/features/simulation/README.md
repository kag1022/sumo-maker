# simulation

フルキャリアを Web Worker で進行させる feature です。UI スレッドをブロックせずに
`src/logic/simulation/` のエンジンを回し、進行状態を store で共有します。

## 責務

- Web Worker ライフサイクル管理（起動・メッセージ往復・終了）
- 進行ステータスの store 管理（場所・取組・年単位の進捗）
- 他 feature（`bashoHub`, `careerResult`）に対する進行状態の公開

## 主要ファイル

- `workers/simulation.worker.ts` キャリア進行の worker エントリ
- `store/simulationStore.ts` 進行状態の store
- `hooks/useSimulation.ts` React 側から worker を利用するための hook

## 依存

- `src/logic/simulation/` 本体エンジン（engine / torikumi / strength / retirement / realism）
- `src/logic/banzuke/` 番付編成
- `src/logic/persistence/` 途中保存・再開

## 公開 API

- `useSimulation()` フック経由で進行開始・一時停止・結果取得を提供
- 直接 worker を叩かず、hook / store を経由してください
