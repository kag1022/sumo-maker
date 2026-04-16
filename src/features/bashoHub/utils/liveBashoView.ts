import type { BashoRecord, Rank, RikishiStatus } from "../../../logic/models";
import type { ImportantTorikumiNote, PlayerBoutDetail } from "../../../logic/simulation/basho";
import type { SimulationDiagnostics } from "../../../logic/simulation/diagnostics";
import type {
  SimulationProgressState,
  FeaturedBoutModel,
  LiveBashoDiagnosticsSummary,
  LiveBashoRaceSummaryItem,
  SimulationChapterKind,
  LiveBashoTone,
  LiveBashoViewModel,
  TorikumiSlateItemModel,
} from "../../../logic/simulation/workerProtocol";

const TRIGGER_PRIORITY: Record<string, number> = {
  YUSHO_DIRECT: 0,
  YUSHO_PURSUIT: 1,
  JURYO_BOUNDARY: 2,
  SEKITORI_BOUNDARY: 3,
  LOWER_BOUNDARY: 4,
  JOI_ASSIGNMENT: 5,
  JOI_DUTY: 6,
  CROSS_DIVISION_EVAL: 7,
  LATE_RELAXATION: 8,
  YUSHO_RACE: 9,
};

const PHASE_LABELS: Record<string, string> = {
  EARLY: "序盤",
  MID_A: "中盤前半",
  MID_B: "中盤後半",
  LATE: "終盤",
  ROUND_1: "初戦帯",
  ROUND_2: "二番目",
  ROUND_3: "三番目",
  ROUND_4: "中盤線",
  ROUND_5: "勝敗整理",
  ROUND_6: "終盤査定",
  ROUND_7: "最終査定",
};

const formatRankDisplayName = (rank: Rank): string => {
  if (rank.division === "Maezumo") return "前相撲";
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) return `${side}${rank.name}`;
  return `${side}${rank.name}${rank.number || 1}枚目`;
};

const formatOpponentRank = (
  note?: Pick<ImportantTorikumiNote, "opponentRank">,
  bout?: Pick<PlayerBoutDetail, "opponentRankName" | "opponentRankNumber" | "opponentRankSide">,
): string => {
  if (note?.opponentRank) return formatRankDisplayName(note.opponentRank);
  if (!bout?.opponentRankName) return "番付不詳";
  const division =
    bout.opponentRankName === "十両"
      ? "Juryo"
      : bout.opponentRankName === "幕下"
        ? "Makushita"
        : bout.opponentRankName === "三段目"
          ? "Sandanme"
          : bout.opponentRankName === "序二段"
            ? "Jonidan"
            : bout.opponentRankName === "序ノ口"
              ? "Jonokuchi"
              : "Makuuchi";
  return formatRankDisplayName({
    division,
    name: bout.opponentRankName,
    number: bout.opponentRankNumber,
    side: bout.opponentRankSide,
  });
};

const formatRecordText = (record: Pick<BashoRecord, "wins" | "losses" | "absent">): string =>
  `${record.wins}勝${record.losses}敗${record.absent > 0 ? `${record.absent}休` : ""}`;

const formatCareerRecordText = (status: RikishiStatus): string =>
  `${status.history.totalWins}勝${status.history.totalLosses}敗${status.history.totalAbsent > 0 ? `${status.history.totalAbsent}休` : ""}`;

export const resolveBashoStakeLabel = (trigger?: string): string => {
  if (trigger === "YUSHO_DIRECT") return "優勝直接戦";
  if (trigger === "YUSHO_PURSUIT") return "優勝追走戦";
  if (trigger === "JOI_DUTY") return "上位総当たり";
  if (trigger === "JOI_ASSIGNMENT") return "上位義務戦";
  if (trigger === "JURYO_BOUNDARY") return "十両・幕下入れ替え戦";
  if (trigger === "LOWER_BOUNDARY") return "段境界の評価戦";
  if (trigger === "SEKITORI_BOUNDARY") return "関取境界戦";
  if (trigger === "CROSS_DIVISION_EVAL") return "越境評価戦";
  if (trigger === "LATE_RELAXATION") return "修復編成";
  if (trigger === "YUSHO_RACE") return "優勝線の一番";
  return "本日の割";
};

const resolveTone = (trigger?: string): LiveBashoTone => {
  if (trigger === "YUSHO_DIRECT" || trigger === "YUSHO_PURSUIT" || trigger === "YUSHO_RACE") return "title";
  if (trigger === "JURYO_BOUNDARY" || trigger === "SEKITORI_BOUNDARY") return "promotion";
  if (trigger === "LOWER_BOUNDARY") return "demotion";
  if (trigger === "JOI_ASSIGNMENT" || trigger === "JOI_DUTY") return "duty";
  return "normal";
};

const resolvePhaseLabel = (phaseId?: string): string => PHASE_LABELS[phaseId ?? ""] ?? "本割";

const buildMatchup = (
  note?: ImportantTorikumiNote,
  bout?: PlayerBoutDetail,
): string => {
  const opponentShikona = note?.opponentShikona ?? bout?.opponentShikona ?? "対戦相手未詳";
  return `${opponentShikona} / ${formatOpponentRank(note, bout)}`;
};

const buildSlateItem = (
  note: ImportantTorikumiNote,
  bout?: PlayerBoutDetail,
  isFeatured = false,
): TorikumiSlateItemModel => ({
  id: `${note.year}-${note.month}-${note.day}-${note.trigger}-${note.opponentId ?? note.opponentShikona ?? "unknown"}`,
  day: note.day,
  kindLabel: resolveBashoStakeLabel(note.trigger),
  summary: note.summary,
  matchup: buildMatchup(note, bout),
  phaseLabel: resolvePhaseLabel(note.phaseId),
  tone: resolveTone(note.trigger),
  isFeatured,
});

const buildFallbackFeaturedBout = (
  playerRecord: BashoRecord,
  playerBouts: PlayerBoutDetail[],
): FeaturedBoutModel | null => {
  const latestBout = playerBouts[playerBouts.length - 1];
  if (!latestBout) return null;
  return {
    day: latestBout.day,
    kindLabel: "本日の一番",
    summary: `${formatRankDisplayName(playerRecord.rank)}で${formatRecordText(playerRecord)}を終えた。`,
    matchup: buildMatchup(undefined, latestBout),
    phaseLabel: "場所総括",
    tone: "normal",
  };
};

const buildDiagnosticsSummary = (
  diagnostics?: SimulationDiagnostics,
): LiveBashoDiagnosticsSummary => {
  const repairCount = Object.values(diagnostics?.torikumiRepairHistogram ?? {}).reduce(
    (sum, count) => sum + count,
    0,
  );
  return {
    scheduleViolations: diagnostics?.torikumiScheduleViolations ?? 0,
    repairCount,
    crossDivisionBoutCount: diagnostics?.crossDivisionBoutCount ?? 0,
    lateDirectTitleBoutCount: diagnostics?.torikumiLateDirectTitleBoutCount ?? 0,
  };
};

const buildRaceSummary = (
  playerRecord: BashoRecord,
  featuredNote: ImportantTorikumiNote | undefined,
  diagnosticsSummary: LiveBashoDiagnosticsSummary,
): LiveBashoRaceSummaryItem[] => [
  {
    id: "record",
    label: "今場所成績",
    value: formatRecordText(playerRecord),
    tone: playerRecord.wins > playerRecord.losses ? "promotion" : playerRecord.losses > playerRecord.wins ? "demotion" : "normal",
  },
  {
    id: "stakes",
    label: "編成文脈",
    value: resolveBashoStakeLabel(featuredNote?.trigger),
    tone: resolveTone(featuredNote?.trigger),
  },
  {
    id: "repair",
    label: "編成健全性",
    value:
      diagnosticsSummary.scheduleViolations > 0
        ? `違反 ${diagnosticsSummary.scheduleViolations}`
        : diagnosticsSummary.repairCount > 0
          ? `修復 ${diagnosticsSummary.repairCount}`
          : "違反なし",
    tone:
      diagnosticsSummary.scheduleViolations > 0
        ? "demotion"
        : diagnosticsSummary.repairCount > 0
          ? "duty"
          : "normal",
  },
];

export const buildLiveBashoView = ({
  seq,
  year,
  month,
  currentAge = null,
  playerRecord,
  playerBouts,
  importantTorikumiNotes,
  diagnostics,
  chapter = {
    chapterKind: null,
    chapterTitle: "場所の観測",
    chapterReason: "この場所で何が起きたかを読みます。",
    heroMoment: "その場所の主役取組を抜き出しました。",
    nextBeatLabel: "次の流れへ進む",
  },
}: {
  seq: number;
  year: number;
  month: number;
  currentAge?: number | null;
  playerRecord: BashoRecord;
  playerBouts: PlayerBoutDetail[];
  importantTorikumiNotes?: ImportantTorikumiNote[];
  diagnostics?: SimulationDiagnostics;
  chapter?: {
    chapterKind: SimulationChapterKind | null;
    chapterTitle: string;
    chapterReason: string;
    heroMoment: string;
    nextBeatLabel: string;
  };
}): LiveBashoViewModel => {
  const sortedNotes = (importantTorikumiNotes ?? [])
    .slice()
    .sort((left, right) =>
      (TRIGGER_PRIORITY[left.trigger] ?? 99) - (TRIGGER_PRIORITY[right.trigger] ?? 99) ||
      right.day - left.day,
    );
  const featuredNote = sortedNotes[0];
  const featuredBout = featuredNote
    ? {
      day: featuredNote.day,
      kindLabel: resolveBashoStakeLabel(featuredNote.trigger),
      summary: featuredNote.summary,
      matchup: buildMatchup(
        featuredNote,
        playerBouts.find((bout) => bout.day === featuredNote.day),
      ),
      phaseLabel: resolvePhaseLabel(featuredNote.phaseId),
      tone: resolveTone(featuredNote.trigger),
    }
    : buildFallbackFeaturedBout(playerRecord, playerBouts);
  const slate = sortedNotes
    .slice(0, 5)
    .map((note, index) =>
      buildSlateItem(
        note,
        playerBouts.find((bout) => bout.day === note.day),
        index === 0,
      ),
    );
  const diagnosticsSummary = buildDiagnosticsSummary(diagnostics);

  return {
    seq,
    year,
    month,
    day: featuredBout?.day ?? null,
    currentAge,
    playerDivision: playerRecord.rank.division,
    currentRank: formatRankDisplayName(playerRecord.rank),
    currentRecord: formatRecordText(playerRecord),
    phaseId: featuredNote?.phaseId ?? "BASHO_END",
    chapterKind: chapter.chapterKind,
    chapterTitle: chapter.chapterTitle,
    chapterReason: chapter.chapterReason,
    heroMoment: chapter.heroMoment,
    nextBeatLabel: chapter.nextBeatLabel,
    contentionTier: featuredNote?.contentionTier ?? "Outside",
    titleImplication: featuredNote?.titleImplication ?? "NONE",
    boundaryImplication: featuredNote?.boundaryImplication ?? "NONE",
    featuredBout,
    torikumiSlate: slate,
    raceSummary: buildRaceSummary(playerRecord, featuredNote, diagnosticsSummary),
    plannedNextPlayerDay: null,
    latestDiagnosticsSummary: diagnosticsSummary,
  };
};

export const buildCareerEpilogueView = ({
  status,
  progress,
  chapterKind,
  chapterTitle,
  chapterReason,
  nextBeatLabel,
}: {
  status: RikishiStatus;
  progress: SimulationProgressState;
  chapterKind: SimulationChapterKind;
  chapterTitle: string;
  chapterReason: string;
  nextBeatLabel: string;
}): LiveBashoViewModel => {
  const lastRecord = status.history.records[status.history.records.length - 1] ?? null;
  const highestRank = formatRankDisplayName(status.history.maxRank);
  const careerIdentity =
    status.careerNarrative?.careerIdentity ??
    `${highestRank}まで届き、${formatCareerRecordText(status)}を残した。`;
  const retirementDigest =
    status.careerNarrative?.retirementDigest ??
    `${status.age}歳で土俵を去った。`;

  const featuredBout: FeaturedBoutModel | null = {
    day: null,
    kindLabel: chapterKind === "RETIREMENT" ? "引退" : "最終総括",
    summary: retirementDigest,
    matchup: `${status.shikona} / ${highestRank}`,
    phaseLabel: "生涯",
    tone: chapterKind === "RETIREMENT" ? "demotion" : "title",
  };

  const raceSummary: LiveBashoRaceSummaryItem[] = [
    {
      id: "highest-rank",
      label: "最高位",
      value: highestRank,
      tone: status.history.maxRank.name === "横綱" ? "title" : "promotion",
    },
    {
      id: "career-record",
      label: "通算成績",
      value: formatCareerRecordText(status),
      tone: "normal",
    },
    {
      id: "career-identity",
      label: "人物像",
      value: careerIdentity,
      tone: "duty",
    },
  ];

  return {
    seq: progress.bashoCount,
    year: progress.year,
    month: progress.month,
    day: null,
    currentAge: status.age,
    playerDivision: lastRecord?.rank.division ?? status.rank.division,
    currentRank: highestRank,
    currentRecord: lastRecord ? formatRecordText(lastRecord) : formatCareerRecordText(status),
    phaseId: "CAREER_END",
    chapterKind,
    chapterTitle,
    chapterReason,
    heroMoment: careerIdentity,
    nextBeatLabel,
    contentionTier: "Outside",
    titleImplication: "NONE",
    boundaryImplication: "NONE",
    featuredBout,
    torikumiSlate: [],
    raceSummary,
    plannedNextPlayerDay: null,
    latestDiagnosticsSummary: {
      scheduleViolations: 0,
      repairCount: 0,
      crossDivisionBoutCount: 0,
      lateDirectTitleBoutCount: 0,
    },
  };
};
