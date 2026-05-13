# Lower Division Kyujo vs 0-7 Gap Report

## Real Data

Source:

- `sumo-api-db/data/analysis/era_basho_records_196007_202603.json`
- `sumo-api-db/data/analysis/era_rank_movements_196007_202603.json`

The scripts stream the large JSON files and write aggregate output only.

For Sandanme rank 40-60:

| record | n | Jonidan 1-30 | Jonidan 31-60 | Jonidan 61-90 | Jonidan 91+ |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0-7 | 101 | 48 | 0 | 0 | 0 |
| 0-0-7 | 407 | 299 | 4 | 0 | 0 |

Result: real data does not support Sandanme 40-60 full absence landing at Jonidan 91+. The observed manual case `三段目49枚目 -> 序二段104枚目` is deeper than the long-range empirical distribution.

## Sim After Fix

`npx tsx scripts/dev/diagnoseLowerDivisionSimKyujoDemotion.ts --careers 100 --seed 20260422`

Forced Sandanme 40-60:

| record | n | Jonidan 1-30 | Jonidan 31-60 | Jonidan 61-90 | Jonidan 91+ |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0-7 | 21 | 5 | 0 | 0 | 0 |
| 0-0-7 | 21 | 19 | 0 | 0 | 0 |

Forced target sample:

```text
東三段目49枚目 0-0-7 -> 東序二段8枚目
```

Natural 0-0-7 samples were sparse in 100 careers, so forced scenario is the useful check for this task.

## Classification

- A. `0-0-7` was not ultimately the same string bucket as `0-7` in code, but the calibration lacked `0-0-7`.
- B. absences are passed into the empirical provider.
- C. confirmed: full absence real-data quantile was missing and the provider had to use nearest-record fallback.
- D. after adding `0-0-7`, the full absence quantile lands near the real-data distribution.
- E. lowerBoundary / dynamic scale did not need a behavioral change for the forced Sandanme 40-60 case.
- F. false for the user case: real data does not make Jonidan 104 a normal landing from Sandanme 49 full absence.
- G. true for natural sim full absence: natural `0-0-7` samples are too sparse for reliable diagnosis.
- H. this was an actual landing-model issue, not only the old movement-display issue.

