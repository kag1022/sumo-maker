# Lower Division Kyujo Demotion Fix Report

## Reproduction

Manual concern:

```text
三段目49枚目 0-0-7
-> 序二段104枚目
```

This landing is deeper than real-data Sandanme 40-60 full-absence outcomes.

## Real Data

For Sandanme rank 40-60 full absence:

- sample: 407
- Jonidan 1-30: 299
- Jonidan 31-60: 4
- Jonidan 61-90: 0
- Jonidan 91+: 0

Therefore, Jonidan 104 is not supported by the long-range sumo-api data.

## Cause

The empirical provider already distinguishes `0-0-7`, but the long-range calibration file did not include `0-0-7` record-aware buckets. That made full absence depend on nearest-record fallback instead of a direct full-absence empirical quantile.

## Implemented Fix

Minimal calibration fix only:

- Add `0-0-7` to required long-range record buckets.
- Regenerate `banzuke_calibration_long_range.json`.
- Update validation so `0-0-7` bucket presence fails fast.

No `0-7` coefficient, guard, clamp, optimizer, or boundary logic was changed.

## After

Forced Sandanme 40-60 in current sim:

| record | n | Jonidan 1-30 | Jonidan 31-60 | Jonidan 61-90 | Jonidan 91+ |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0-7 | 21 | 5 | 0 | 0 | 0 |
| 0-0-7 | 21 | 19 | 0 | 0 | 0 |

Key target:

```text
東三段目49枚目 0-0-7 -> 東序二段8枚目
```

This is close to the real-data landing pattern and removes the Jonidan 104-style overdrop for the diagnostic scenario.

## Not Implemented

- no full-absence soft cap
- no `0-7` guard
- no division-boundary landing cap
- no optimizer penalty change
- no UI display change

Those are not justified by the current diagnosis. If a future natural-play seed still produces `0-0-7 -> Jonidan 91+`, the next diagnosis should capture the exact banzuke decision and lower-boundary candidate list for that seed.

