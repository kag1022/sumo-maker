# logic/simulation/observation

長期観測の正式入口です。Monte Carlo、probe、verification の長期分布系は
このディレクトリの API だけを使います。

## 公開 API

- `runCareerObservation()` 1 seed のキャリアを runtime API 経由で最後まで回す
- `runObservationBatch()` 複数 seed の観測を順に実行する
- `summarizeCareerObservation()` 単一キャリアの summary を返す
- `summarizeObservationBatch()` batch 集計を返す
- `runObservationVerificationSample()` verification 向けの batch 集計を返す

## Verification population gate

`annualAbsDeltaP90` は各年の banzuke active headcount の年末差分を絶対値で集計する
小標本 smoke metric です。`population_calibration_heisei.json` の `annualTotalDelta`
は signed quantile なので、この gate は calibration 直結の厳密比較ではありません。
lower bound は 5 seed x 20 year の決定論サンプルで brittle にならないよう、
実データの正方向 annual delta 最大値を最低限の churn 床として使います。

## ルール

- `world`, `runOneStep`, `lowerQuota`, `sekitoriQuota` を直接読まない
- report / probe / verification の worker は `.tmp/sim-tests/.../observation/index.js` だけを import する
- 単一モデル前提で扱い、`baseline/candidate/compare` を observation 契約に持ち込まない
