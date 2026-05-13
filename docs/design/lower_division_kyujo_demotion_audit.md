# Lower Division Kyujo Demotion Audit

## Scope

This audit covers lower-division full absence (`0-0-7`) movement only. It does not change torikumi, battle, EraSnapshot, UI, Dexie, or the general `0-7` movement curve.

All requested prior documents were present:

- `docs/design/lower_division_demotion_width_audit.md`
- `docs/design/lower_division_demotion_width_gap_report.md`
- `docs/design/lower_division_realdata_source_audit.md`
- `docs/design/lower_division_0_7_tail_trace.md`
- `docs/design/lower_division_0_7_tail_trace_audit.md`
- `docs/design/lower_division_movement_display_audit.md`
- `docs/project_context/03_simulation_logic_spec.md`
- `docs/project_context/04_data_model_and_state.md`
- `docs/project_context/06_current_implementation_status.md`

## Current Path

- `src/logic/banzuke/providers/lowerBoundary.ts` passes `wins`, `losses`, and `absent` into the empirical provider.
- `src/logic/banzuke/providers/empirical.ts` resolves `0-0-7` as a distinct `recordBucket` when `absent > 0`.
- `src/logic/banzuke/rules/singleRankChange.ts` skips both `0-7` and full absence, so the lower-boundary empirical path is the relevant path.
- Player full absence is treated as mandatory demotion outside Jonokuchi.

## Problem

The long-range calibration exporter did not require `0-0-7` in `recordAwareQuantiles`. The provider could request `0-0-7`, but the calibration lacked that bucket, so nearest-record fallback could silently use a non-kyujo bucket.

This is not the same problem as the earlier `0-7` tail display issue. The earlier 300-slot tail was coordinate mixing in external display math; this issue is an actual missing empirical bucket for full absence.

## Suspicious Point

`scripts/dev/exportLongRangeBanzukeCalibration.ts` had:

```text
0-7, 1-6, 2-5, 3-4, 4-3, 5-2, 6-1, 7-0
```

but not:

```text
0-0-7
```

## Files Touched

- `scripts/dev/exportLongRangeBanzukeCalibration.ts`
- `scripts/dev/validateLongRangeBanzukeCalibration.ts`
- `sumo-api-db/data/analysis/banzuke_calibration_long_range.json`
- `scripts/dev/diagnoseLowerDivisionRealdataKyujoDemotion.ts`
- `scripts/dev/diagnoseLowerDivisionSimKyujoDemotion.ts`

## Files Not Touched

- banzuke optimizer behavior
- lower-boundary placement algorithm
- torikumi
- battle
- EraSnapshot
- UI
- Dexie schema

