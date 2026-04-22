# logic/simulation/observation

長期観測の正式入口です。Monte Carlo、probe、verification の長期分布系は
このディレクトリの API だけを使います。

## 公開 API

- `runCareerObservation()` 1 seed のキャリアを runtime API 経由で最後まで回す
- `runObservationBatch()` 複数 seed の観測を順に実行する
- `summarizeCareerObservation()` 単一キャリアの summary を返す
- `summarizeObservationBatch()` batch 集計を返す
- `runObservationVerificationSample()` verification 向けの batch 集計を返す

## ルール

- `world`, `runOneStep`, `lowerQuota`, `sekitoriQuota` を直接読まない
- report / probe / verification の worker は `.tmp/sim-tests/.../observation/index.js` だけを import する
- 単一モデル前提で扱い、`baseline/candidate/compare` を observation 契約に持ち込まない
