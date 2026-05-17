import React from "react";
import { Eye, ScrollText, Swords, Trophy } from "lucide-react";
import type { CareerRivalryDigest, RikishiStatus } from "../../../logic/models";
import { getCareerHeadToHead, listCareerBashoRecordsBySeq, listCareerPlayerBoutsByBasho } from "../../../logic/persistence/careerHistory";
import { useLocale } from "../../../shared/hooks/useLocale";
import { cn } from "../../../shared/lib/cn";
import surface from "../../../shared/styles/surface.module.css";
import typography from "../../../shared/styles/typography.module.css";
import { Button } from "../../../shared/ui/Button";
import { WinLossBar } from "../../../shared/ui/WinLossBar";
import { buildCareerRivalryDigest } from "../utils/reportRivalry";
import { formatReportRecordText, textForLocale } from "../utils/reportLocale";
import { BashoDetailBody, type BashoDetailModalState } from "./BashoDetailModal";
import reportCommon from "./reportCommon.module.css";
import { useCareerBashoDetail } from "./useCareerBashoDetail";

const EMPTY_RIVALRY_DIGEST: CareerRivalryDigest = {
  titleBlockers: [],
  eraTitans: [],
  nemesis: [],
};

interface RivalryTabProps {
  status: RikishiStatus;
  careerId?: string | null;
}

export const RivalryTab: React.FC<RivalryTabProps> = ({ status, careerId = null }) => {
  const { locale } = useLocale();
  const [digest, setDigest] = React.useState<CareerRivalryDigest>(status.careerRivalryDigest ?? EMPTY_RIVALRY_DIGEST);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [selectedState, setSelectedState] = React.useState<BashoDetailModalState | null>(null);
  const detailQuery = useCareerBashoDetail(careerId, selectedState, status);

  React.useEffect(() => {
    let cancelled = false;
    if (status.careerRivalryDigest) {
      setDigest(status.careerRivalryDigest);
      setErrorMessage(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (!careerId) {
      setDigest(EMPTY_RIVALRY_DIGEST);
      setErrorMessage(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setErrorMessage(null);
    void (async () => {
      try {
        const [headToHeadRows, boutsByBasho, bashoRowsBySeq] = await Promise.all([
          getCareerHeadToHead(careerId),
          listCareerPlayerBoutsByBasho(careerId),
          listCareerBashoRecordsBySeq(careerId),
        ]);
        if (cancelled) return;
        setDigest(buildCareerRivalryDigest(status, headToHeadRows, boutsByBasho, bashoRowsBySeq));
      } catch {
        if (!cancelled) {
          setDigest(EMPTY_RIVALRY_DIGEST);
          setErrorMessage(locale === "en" ? "Rivalry records could not be restored, so this tab is showing a simplified view." : "対戦記録の復元に失敗したため、この画面だけ簡易表示です。");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [careerId, locale, status]);

  const sections = [
    {
      title: locale === "en" ? "Title Blocker" : "優勝を阻んだ相手",
      description: locale === "en" ? "Opponents who stood in front of a title or peak moment." : "賜杯や最高到達点の手前で立ちはだかった相手です。",
      entries: digest.titleBlockers.slice(0, 1),
    },
    {
      title: locale === "en" ? "Era Rival" : "時代を共にした強敵",
      description: locale === "en" ? "Opponents repeatedly met around the same rank band." : "何度も同じ番付帯で向き合った相手です。",
      entries: digest.eraTitans.slice(0, 1),
    },
    {
      title: locale === "en" ? "Uncleared Wall" : "乗り越えきれなかった壁",
      description: locale === "en" ? "Opponents whose record stayed difficult across the career." : "黒星が先行し続け、人生の影を落とした相手です。",
      entries: digest.nemesis.slice(0, 1),
    },
  ] as const;

  return (
    <div className="space-y-4">
      <section className={cn(surface.detailCard, "relative overflow-hidden p-4 sm:p-5")}>
        <div className="absolute inset-y-0 left-0 w-1 bg-warning/35" />
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h3 className={typography.sectionHeader}>
              <Swords className="w-4 h-4 text-warning" /> {locale === "en" ? "Career Rivals" : "立ちはだかったライバル"}
            </h3>
            <p className="mt-1 text-xs text-text-dim">
              {locale === "en" ? "This tab keeps the opponents that shaped the saved career, not every matchup." : "大量の対戦表ではなく、この人生を揺らした相手だけを残します。"}
            </p>
          </div>
        </div>
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.title} className="space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between border-b border-brand-muted/30 pb-2">
                <div className={cn(typography.label, "text-sm text-text font-bold")}>{section.title}</div>
                <div className="text-[11px] text-text-dim italic">{section.description}</div>
              </div>
              {section.entries.length === 0 ? (
                <div className={cn(reportCommon.empty, "text-[11px]")}>
                  {isLoading
                    ? locale === "en" ? "Loading rivalry history..." : "対戦史を読み込んでいます..."
                    : locale === "en" ? "No opponent was recorded for this lens." : "この軸で残すべき相手は見つかりませんでした。"}
                </div>
              ) : (
                section.entries.map((entry) => (
                  <div key={`${section.title}-${entry.opponentId}`} className="space-y-2">
                    <div className="border border-brand-muted/50 bg-surface-base/75 p-4 transition-colors hover:border-gold/20 hover:bg-bg/25">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <div className={cn(typography.heading, "text-lg text-text tracking-wide")}>{entry.shikona}</div>
                            <div className="text-[10px] uppercase tracking-[0.2em] text-text-dim">{textForLocale(locale, entry.representativeRankLabel, "Recorded rank")}</div>
                          </div>
                          <p className="text-sm leading-relaxed text-text/80">
                            {locale === "en"
                              ? "A rivalry marker is saved for this opponent."
                              : `「${entry.summary}」`}
                          </p>
                          <div className="grid gap-2 sm:grid-cols-3 text-[11px] text-text-dim">
                            <div className="border border-brand-muted/40 bg-bg/20 px-3 py-2">
                              <div className="mb-1 flex items-center gap-1">
                                <Trophy className="w-3 h-3 text-warning" /> {locale === "en" ? "Career" : "通算"}
                              </div>
                              <div className="text-text">{formatReportRecordText(entry.headToHead.wins, entry.headToHead.losses, entry.headToHead.absences, locale)}</div>
                              <WinLossBar
                                wins={entry.headToHead.wins}
                                losses={entry.headToHead.losses}
                                absent={entry.headToHead.absences}
                                showLabels={false}
                                height="sm"
                                className="mt-1.5"
                              />
                            </div>
                            <div className="border border-brand-muted/40 bg-bg/20 px-3 py-2">
                              <div className="mb-1 flex items-center gap-1">
                                <ScrollText className="w-3 h-3 text-brand-line" /> {locale === "en" ? "Featured Basho" : "象徴の場所"}
                              </div>
                              <div className="text-text">{textForLocale(locale, entry.featuredBashoLabel, `Basho ${entry.featuredSeq}`)}</div>
                            </div>
                            <div className="border border-brand-muted/40 bg-bg/20 px-3 py-2">
                              <div className="mb-1 flex items-center gap-1">
                                <Swords className="w-3 h-3 text-action" /> {locale === "en" ? "Weight" : "濃さ"}
                              </div>
                              <div className="text-text">{locale === "en" ? `${entry.evidenceCount} records` : `${entry.evidenceCount}件の記録`}</div>
                            </div>
                          </div>
                          <p className="text-xs leading-relaxed text-text-dim">
                            {textForLocale(locale, entry.featuredReason, "This basho is the saved reference point for the rivalry.")}
                          </p>
                        </div>
                        {careerId && (
                          <Button
                            variant={selectedState?.bashoSeq === entry.featuredSeq && selectedState?.highlightOpponentId === entry.opponentId ? "secondary" : "outline"}
                            size="sm"
                            className="h-9 shrink-0 gap-2"
                            onClick={() =>
                              setSelectedState(
                                selectedState?.bashoSeq === entry.featuredSeq && selectedState?.highlightOpponentId === entry.opponentId
                                  ? null
                                  : {
                                    kind: "rival",
                                    bashoSeq: entry.featuredSeq,
                                    sourceLabel: locale === "en" ? "Rivals" : "対戦・宿敵",
                                    title: locale === "en" ? `${textForLocale(locale, entry.featuredBashoLabel, `Basho ${entry.featuredSeq}`)} detail` : `${entry.featuredBashoLabel}の場所詳細`,
                                    subtitle: `${section.title} / ${entry.shikona}`,
                                    highlightOpponentId: entry.opponentId,
                                    highlightReason: textForLocale(locale, entry.featuredReason, "This basho is the saved reference point for the rivalry."),
                                  },
                              )
                            }
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {locale === "en"
                              ? selectedState?.bashoSeq === entry.featuredSeq && selectedState?.highlightOpponentId === entry.opponentId
                                ? "Close"
                                : "Open Rival Basho"
                              : selectedState?.bashoSeq === entry.featuredSeq && selectedState?.highlightOpponentId === entry.opponentId
                                ? "閉じる"
                                : "この因縁の場所を見る"}
                          </Button>
                        )}
                      </div>
                    </div>
                    {selectedState?.bashoSeq === entry.featuredSeq && selectedState?.highlightOpponentId === entry.opponentId && (
                      <div className="border border-warning/35 bg-bg/18 px-4 py-4">
                        <div className="mb-4 border-b border-brand-muted/40 pb-3">
                          <div className={cn(typography.label, "text-[10px] tracking-[0.25em] text-warning/80 uppercase")}>{locale === "en" ? "Rival Detail" : "宿敵詳細"}</div>
                          <div className={cn(typography.heading, "mt-1 text-sm text-text")}>{locale === "en" ? `${textForLocale(locale, entry.featuredBashoLabel, `Basho ${entry.featuredSeq}`)} rivalry` : `${entry.featuredBashoLabel}の因縁`}</div>
                          <div className="mt-1 text-xs text-text-dim">{section.title} / {entry.shikona}</div>
                        </div>
                        <BashoDetailBody
                          state={selectedState}
                          detail={detailQuery.detail}
                          status={status}
                          isLoading={detailQuery.isLoading}
                          errorMessage={detailQuery.errorMessage}
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ))}
          {errorMessage && <div className="text-xs text-warning-bright">{errorMessage}</div>}
        </div>
      </section>
    </div>
  );
};
