import React from "react";
import { Save } from "lucide-react";
import { type RikishiStatus } from "../../../logic/models";
import { Button } from "../../../shared/ui/Button";
import { RikishiPortrait } from "../../../shared/ui/RikishiPortrait";
import type { CareerLedgerModel, CareerLedgerPoint, CareerOverviewModel } from "../utils/careerResultModel";
import type { DetailBuildProgress } from "../../../logic/simulation/workerProtocol";

interface CareerOverviewChapterProps {
  status: RikishiStatus;
  overview: CareerOverviewModel;
  ledger: CareerLedgerModel;
  highestRankLabel: string;
  selectedPoint: CareerLedgerPoint | null;
  isSaved: boolean;
  detailState: "idle" | "building" | "ready" | "error";
  detailBuildProgress: DetailBuildProgress | null;
  onSave: () => void | Promise<void>;
  onOpenEra: () => void;
  onReturnToScout: () => void;
  onSelectBasho: (bashoSeq: number) => void;
  onOpenChapter: (chapter: "trajectory" | "place" | "review", bashoSeq?: number | null) => void;
}

export const CareerOverviewChapter: React.FC<CareerOverviewChapterProps> = ({
  status,
  overview,
  ledger,
  highestRankLabel,
  isSaved,
  detailState,
  detailBuildProgress,
  onSave,
  onReturnToScout,
}) => {
  const saveDisabled = detailState !== "ready";
  const decisionCopy = saveDisabled
    ? `記録整理中 ${detailBuildProgress?.flushedBashoCount ?? 0}/${detailBuildProgress?.totalBashoCount ?? ledger.points.length}。保存は詳細章の整理後に開きます。`
    : "表紙では、この人生を残すかどうかだけ先に決めます。詳しい掘り下げは本文の章から行います。";

  return (
    <section className="career-poster-hero">
      <div className="career-poster-grain" />
      <div className="career-poster-ring" />
      <div className="career-poster-lane" />

      <div className="career-poster-content">
        <div className="career-poster-copy">
          <p className="career-poster-kicker">力士記録</p>
          <h1 className="career-poster-name">{overview.shikona}</h1>
          <div className="career-poster-rank">{highestRankLabel}</div>
          <div className="career-poster-origin">
            {overview.birthplace} / {overview.stableName}
          </div>
          <div className="career-poster-facts">
            <div className="career-poster-fact">
              <span className="career-poster-fact-label">通算</span>
              <span className="career-poster-fact-value">{overview.totalRecordLabel}</span>
            </div>
            <div className="career-poster-fact">
              <span className="career-poster-fact-label">勝率</span>
              <span className="career-poster-fact-value">{overview.winRateLabel}</span>
            </div>
            <div className="career-poster-fact">
              <span className="career-poster-fact-label">在位</span>
              <span className="career-poster-fact-value">{overview.careerPeriodLabel}</span>
            </div>
          </div>
          <p className="career-poster-summary">{overview.lifeSummary}</p>
        </div>

        <div className="career-poster-portrait-dock">
          <RikishiPortrait
            bodyType={status.bodyType}
            className="career-poster-portrait"
            innerClassName="career-poster-portrait-inner"
            presentation="blend"
          />
        </div>
      </div>

      <div className="career-poster-slit">
        {!isSaved ? (
          <div className="career-decision-band">
            <div>
              <div className="career-decision-kicker">保存判断</div>
              <div className="career-decision-copy">{decisionCopy}</div>
            </div>
            <div className="career-decision-actions">
              <Button size="lg" disabled={saveDisabled} onClick={() => void onSave()}>
                <Save className="mr-2 h-4 w-4" />
                {saveDisabled ? "記録整理中" : "この人生を保存する"}
              </Button>
              <Button variant="outline" onClick={onReturnToScout}>
                保存せず次の新弟子へ
              </Button>
            </div>
          </div>
        ) : (
          <div className="career-return-strip">
            <div className="career-reading-nav-copy">
              <div className="career-decision-kicker">保存済み</div>
              <div className="career-decision-copy">
                表紙をめくったあとは、本文の章から番付推移や各場所の詳細を静かに読み進めます。
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onReturnToScout}>
              新弟子設計へ戻る
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};
