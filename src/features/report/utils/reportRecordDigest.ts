import type { RikishiStatus } from "../../../logic/models";
import type { LocaleCode } from "../../../shared/lib/locale";
import {
  formatReportBashoCount,
  formatReportBashoLabel,
  formatReportRankLabel,
  formatReportRecordText,
  formatReportSpecialPrizeList,
} from "./reportLocale";

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

export const buildReportRecordDigest = (
  status: RikishiStatus,
  locale: LocaleCode = "ja",
): ReportRecordDigest => {
  const rows = status.history.records
    .map((record, index) => ({ record, bashoSeq: index + 1 }))
    .filter(({ record }) => record.rank.division !== "Maezumo")
    .reverse()
    .map(({ record, bashoSeq }) => {
      const achievements: string[] = [];
      if (record.yusho) achievements.push(locale === "en" ? "Yusho" : "優勝");
      if (record.specialPrizes?.length) achievements.push(formatReportSpecialPrizeList(record.specialPrizes, locale));
      if (record.kinboshi) achievements.push(locale === "en" ? `Kinboshi ${record.kinboshi}` : `金星 ${record.kinboshi}`);
      if (record.absent >= 5) achievements.push(locale === "en" ? `Long absence ${record.absent}` : `長期休場 ${record.absent}`);

      const emphasis: ReportRecordDigestRow["emphasis"] =
        record.yusho || (record.specialPrizes?.length ?? 0) > 0 || (record.kinboshi ?? 0) > 0
          ? "state"
          : record.absent >= 5 || record.losses > record.wins
            ? "warning"
            : "neutral";

      return {
        bashoSeq,
        bashoLabel: formatReportBashoLabel(record.year, record.month, locale),
        rankLabel: formatReportRankLabel(record.rank, locale),
        recordText: formatReportRecordText(record.wins, record.losses, record.absent, locale),
        achievementText: achievements[0] ?? (locale === "en" ? "Record only" : "記録のみ"),
        emphasis,
      };
    });

  const yusho = status.history.yushoCount.makuuchi + status.history.yushoCount.juryo + status.history.yushoCount.makushita + status.history.yushoCount.others;
  const prizes = status.history.records.reduce((sum, record) => sum + (record.specialPrizes?.length ?? 0), 0);
  const kinboshi = status.history.records.reduce((sum, record) => sum + (record.kinboshi ?? 0), 0);
  const summaryParts = [
    formatReportBashoCount(rows.length, locale),
    yusho > 0 ? (locale === "en" ? `Yusho ${yusho}` : `優勝 ${yusho}`) : null,
    prizes > 0 ? (locale === "en" ? `Sansho ${prizes}` : `三賞 ${prizes}`) : null,
    kinboshi > 0 ? (locale === "en" ? `Kinboshi ${kinboshi}` : `金星 ${kinboshi}`) : null,
  ].filter(Boolean);

  return {
    rows,
    summaryLine: summaryParts.join(" / "),
  };
};
