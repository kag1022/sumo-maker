import type { RikishiStatus } from "../../../logic/models";
import { formatBashoLabel, formatRankDisplayName } from "./reportShared";

const formatRecordText = (wins: number, losses: number, absent: number): string =>
  `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ""}`;

export interface ReportRecordDigestRow {
  bashoSeq: number;
  bashoLabel: string;
  rankLabel: string;
  recordText: string;
  achievementText: string;
  emphasis: "state" | "warning" | "neutral";
}

export interface ReportRecordDigest {
  rows: ReportRecordDigestRow[];
  summaryLine: string;
}

export const buildReportRecordDigest = (status: RikishiStatus): ReportRecordDigest => {
  const rows = status.history.records
    .map((record, index) => ({ record, bashoSeq: index + 1 }))
    .filter(({ record }) => record.rank.division !== "Maezumo")
    .reverse()
    .map(({ record, bashoSeq }) => {
      const achievements: string[] = [];
      if (record.yusho) achievements.push("優勝");
      if (record.specialPrizes?.length) achievements.push(record.specialPrizes.join(" / "));
      if (record.kinboshi) achievements.push(`金星 ${record.kinboshi}`);
      if (record.absent >= 5) achievements.push(`長期休場 ${record.absent}`);

      const emphasis: ReportRecordDigestRow["emphasis"] =
        record.yusho || (record.specialPrizes?.length ?? 0) > 0 || (record.kinboshi ?? 0) > 0
          ? "state"
          : record.absent >= 5 || record.losses > record.wins
            ? "warning"
            : "neutral";

      return {
        bashoSeq,
        bashoLabel: formatBashoLabel(record.year, record.month),
        rankLabel: formatRankDisplayName(record.rank),
        recordText: formatRecordText(record.wins, record.losses, record.absent),
        achievementText: achievements[0] ?? "記録のみ",
        emphasis,
      };
    });

  const yusho = status.history.yushoCount.makuuchi + status.history.yushoCount.juryo + status.history.yushoCount.makushita + status.history.yushoCount.others;
  const prizes = status.history.records.reduce((sum, record) => sum + (record.specialPrizes?.length ?? 0), 0);
  const kinboshi = status.history.records.reduce((sum, record) => sum + (record.kinboshi ?? 0), 0);
  const summaryParts = [`${rows.length}場所`, yusho > 0 ? `優勝 ${yusho}` : null, prizes > 0 ? `三賞 ${prizes}` : null, kinboshi > 0 ? `金星 ${kinboshi}` : null].filter(Boolean);

  return {
    rows,
    summaryLine: summaryParts.join(" / "),
  };
};
