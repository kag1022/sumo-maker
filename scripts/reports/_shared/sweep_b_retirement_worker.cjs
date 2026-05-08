// Worker for B-retirement sweep harness. READ-ONLY for src/. Applies
// runtime monkey-patch overrides to .tmp/sim-tests compiled retirement
// shared module BEFORE invoking runCareerObservation.
//
// Override surface (all optional fields on workerData.overrides):
//   earlyExitRollDelta             — number; shifts EARLY_EXIT cutoff (earlyExitUpper) by +delta
//                                    in resolveRetirementProfileBiased (B1)
//   washoutMultiplier              — number; multiplies retirement chance when profile === 'EARLY_EXIT'
//                                    AND careerBand === 'WASHOUT' (proxy for "WASHOUT retirementProfile
//                                    multiplier" — WASHOUT careerBand maps to elevated EARLY_EXIT roll
//                                    in resolveRetirementProfileBiased) (B2)
//   makekoshiStreakThreshold       — number (5/4/3); reduces effective threshold by adding (5-threshold)
//                                    to consecutiveMakekoshi input before delegating to original
//                                    resolveRetirementChance (B3)
//   spiritStagnationThresholdBasho — number (24/18/12); the existing src has no SPIRIT mechanism but
//                                    early-low-win-non-sekitori window hazard fires for careerBasho
//                                    in [6, 24] when winRate < 0.38. This override shifts the maxCareerBasho
//                                    upper bound. We approximate by extending the window via post-multiplier
//                                    when careerBashoCount in (24, threshold] AND winRate < 0.38 (B4)
//   lowerLowWinRetireBoost         — number (0/0.05/0.10); additive bonus to retirement chance
//                                    when in lower divisions (Sandanme/Jonidan/Jonokuchi) and winRate < 0.30 (B5)
//   sekitoriExperiencedRetireMultiplier — number (1.0/0.85/0.75); multiplies retirement chance when
//                                    isFormerSekitori === true (B6)
'use strict';
const path = require('path');
const { parentPort, workerData } = require('worker_threads');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SHARED_PATH = path.join(REPO_ROOT, '.tmp', 'sim-tests', 'src', 'logic', 'simulation', 'retirement', 'shared.js');

const applyOverrides = (overrides) => {
  if (!overrides || Object.keys(overrides).length === 0) return;
  const shared = require(SHARED_PATH);
  const origChance = shared.resolveRetirementChance;
  const origBiased = shared.resolveRetirementProfileBiased;

  // ---- B1: earlyExitRollDelta ----
  if (Number.isFinite(overrides.earlyExitRollDelta) && overrides.earlyExitRollDelta !== 0) {
    const delta = overrides.earlyExitRollDelta;
    // Re-implement deterministicHash + biased logic with shifted earlyExitUpper.
    const deterministicHash = (text) => {
      let hash = 2166136261;
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return ((hash >>> 0) % 1000003) / 1000003;
    };
    shared.resolveRetirementProfileBiased = (seedText, careerBand, growthType) => {
      const roll = deterministicHash(seedText);
      let earlyExitUpper = 0.08;
      let ironmanLower = 0.97;
      if (careerBand === 'GRINDER') {
        earlyExitUpper = 0.05; ironmanLower = 0.93;
      } else if (careerBand === 'WASHOUT') {
        earlyExitUpper = 0.18; ironmanLower = 0.98;
      }
      if (growthType === 'LATE') {
        earlyExitUpper = Math.max(earlyExitUpper - 0.03, 0.01);
        ironmanLower = Math.min(ironmanLower, 0.95);
      } else if (growthType === 'EARLY') {
        earlyExitUpper = Math.min(earlyExitUpper + 0.04, 0.25);
      }
      // Apply override delta — clamp to keep ironmanLower above earlyExitUpper.
      earlyExitUpper = Math.min(Math.max(earlyExitUpper + delta, 0), ironmanLower - 0.001);
      if (roll < earlyExitUpper) return 'EARLY_EXIT';
      if (roll >= ironmanLower) return 'IRONMAN';
      return 'STANDARD';
    };
  }

  // ---- B2/B3/B4/B5/B6: wrap resolveRetirementChance ----
  const wash = Number.isFinite(overrides.washoutMultiplier) ? overrides.washoutMultiplier : 1;
  const mkThr = Number.isFinite(overrides.makekoshiStreakThreshold) ? overrides.makekoshiStreakThreshold : null;
  const spirit = Number.isFinite(overrides.spiritStagnationThresholdBasho) ? overrides.spiritStagnationThresholdBasho : null;
  const lowerBoost = Number.isFinite(overrides.lowerLowWinRetireBoost) ? overrides.lowerLowWinRetireBoost : 0;
  const sekiMult = Number.isFinite(overrides.sekitoriExperiencedRetireMultiplier)
    ? overrides.sekitoriExperiencedRetireMultiplier : 1;

  const needsWrap = wash !== 1 || mkThr != null || spirit != null
    || lowerBoost !== 0 || sekiMult !== 1;
  if (!needsWrap) return;

  shared.resolveRetirementChance = (input) => {
    let modInput = input;
    // B3: simulate lowering streak threshold from baseline 5 to 4 or 3
    // by inflating consecutiveMakekoshi input. NON_SEKITORI hazard.start = 3 (not 5);
    // SEKITORI groups have hazard.start = 6. The plan says current=5/4/3.
    // We interpret this as the de-facto effective NON_SEKITORI streak start: 3 baseline.
    // Actually the spec says current/current-1/current-2 i.e. 5/4/3 — interpret 5 as
    // baseline reference (since NON_SEKITORI base=3 already, lowering to 4/3 effectively
    // means strengthen by adding small streak bonus). Simplified: when threshold < 5,
    // bump consecutiveMakekoshi by (5 - threshold) so the streak hazard fires earlier
    // for whichever group.
    if (mkThr != null && mkThr < 5) {
      modInput = { ...modInput, consecutiveMakekoshi: (input.consecutiveMakekoshi || 0) + (5 - mkThr) };
    }
    let chance = origChance.call(shared, modInput);

    // B2: WASHOUT careerBand (which biases profile toward EARLY_EXIT) → multiplier
    if (wash !== 1 && input.careerBand === 'WASHOUT') {
      chance *= wash;
    }
    // B4: SPIRIT-style stagnation — extend low-win early-exit window from baseline 24
    // up to the override threshold. When sim's earlyLowWin window already fired we
    // do nothing; for careerBasho > 24 and <= override and winRate < 0.38 add extra
    // hazard equal to a shrunk version of nonSekitoriEarlyLowWin.
    if (spirit != null && spirit > 24) {
      const isSekitori = input.currentDivision === 'Makuuchi' || input.currentDivision === 'Juryo';
      if (!isSekitori
        && input.careerBashoCount > 24
        && input.careerBashoCount <= spirit
        && Number.isFinite(input.careerWinRate)
        && input.careerWinRate < 0.38) {
        const extra = 0.018 + (0.38 - input.careerWinRate) * 0.12;
        chance += extra;
      }
    } else if (spirit != null && spirit < 24) {
      // shorter threshold: tighten window — add a stagnation boost when
      // careerBashoCount >= spirit and winRate < 0.4 in lower divisions
      const isSekitori = input.currentDivision === 'Makuuchi' || input.currentDivision === 'Juryo';
      if (!isSekitori
        && input.careerBashoCount >= spirit
        && Number.isFinite(input.careerWinRate)
        && input.careerWinRate < 0.40) {
        chance += 0.010;
      }
    }
    // B5: lowerLowWinRetireBoost — Sandanme/Jonidan/Jonokuchi + winRate < 0.30
    if (lowerBoost !== 0) {
      const div = input.currentDivision;
      if ((div === 'Sandanme' || div === 'Jonidan' || div === 'Jonokuchi')
        && Number.isFinite(input.careerWinRate)
        && input.careerWinRate < 0.30) {
        chance += lowerBoost;
      }
    }
    // B6: sekitoriExperiencedRetireMultiplier
    if (sekiMult !== 1 && input.isFormerSekitori === true) {
      chance *= sekiMult;
    }
    // clamp identical to source: 0..0.92
    if (!Number.isFinite(chance) || chance < 0) chance = 0;
    if (chance > 0.92) chance = 0.92;
    return chance;
  };
};

const run = async () => {
  applyOverrides(workerData.overrides || {});
  const { loadObservationModule } = require('./observation_module.cjs');
  const { extractRealdataDiagnosisFeatures } = require('./realdata_diagnosis_features.cjs');
  const { runCareerObservation } = loadObservationModule();
  const result = await runCareerObservation({
    seed: workerData.seed,
    simulationModelVersion: 'v3',
    populationKind: workerData.populationKind,
    populationPreset: workerData.populationPreset,
  });
  parentPort.postMessage(extractRealdataDiagnosisFeatures(result));
};

run().catch((error) => {
  console.error('sweep-b worker error:', error);
  process.exit(1);
});
