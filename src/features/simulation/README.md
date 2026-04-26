# simulation

フルキャリアを Web Worker で進行させる feature です。UI スレッドは
`src/logic/simulation/runtime.ts` の API と worker protocol だけを相手にします。

## 責務

- Web Worker ライフサイクル管理
- `SEASON_STEP` / `RUNTIME_COMPLETED` 契約の受信
- store への進行状態反映
- `bashoHub`, `careerResult` への観測データ公開

## 主要ファイル

- `workers/simulation.worker.ts` runtime を駆動し、detail build と worker protocol を橋渡しする
- `store/simulationStore.ts` 進行状態の store
- `hooks/useSimulation.ts` React 側の公開入口

## 依存

- `src/logic/simulation/runtime.ts` runtime API
- `src/logic/simulation/workerProtocol.ts` メッセージ契約
- `src/logic/persistence/` 途中保存・再開

## 実装ルール

- feature 側から `runOneStep` や `world` を直接触らない
- 進行中の物語断片は `DomainEvent` と worker payload を通して受け取る
- protocol を変えたら worker / store / result 画面を一緒に更新する

## 公開 API

- `useSimulation()` フック経由で進行開始・再開・結果取得を提供する
- `useSimulation()` は `runtimeSnapshot` と `latestDomainEvents` を公開し、UI は status-only に依存しない
- 直接 worker を叩かず、hook / store を経由する
