import React from "react";
import { motion } from "framer-motion";
import { Save, Scale, ScrollText, Table2, TableProperties } from "lucide-react";
import { type RikishiStatus } from "../../../logic/models";
import { Button } from "../../../shared/ui/Button";
import { RikishiPortrait } from "../../../shared/ui/RikishiPortrait";
import type { CareerLedgerModel, CareerLedgerPoint, CareerOverviewModel } from "../utils/careerResultModel";

interface CareerOverviewChapterProps {
  status: RikishiStatus;
  overview: CareerOverviewModel;
  ledger: CareerLedgerModel;
  highestRankLabel: string;
  selectedPoint: CareerLedgerPoint | null;
  isSaved: boolean;
  onSave: () => void | Promise<void>;
  onOpenEra: () => void;
  onReturnToScout: () => void;
  onSelectBasho: (bashoSeq: number) => void;
  onOpenChapter: (chapter: "trajectory" | "place" | "review", bashoSeq?: number | null) => void;
}

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
};

const rise = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" as const } },
};

export const CareerOverviewChapter: React.FC<CareerOverviewChapterProps> = ({
  status,
  overview,
  ledger,
  highestRankLabel,
  selectedPoint,
  isSaved,
  onSave,
  onOpenEra,
  onReturnToScout,
  onSelectBasho,
  onOpenChapter,
}) => (
  <section className="career-poster-hero">
    <div className="career-poster-grain" />
    <div className="career-poster-ring" />
    <div className="career-poster-lane" />

    <motion.div
      className="career-poster-content"
      initial="hidden"
      animate="show"
      variants={stagger}
    >
      <div className="career-poster-copy">
        <motion.p className="career-poster-kicker" variants={rise}>
          力士記録
        </motion.p>
        <motion.h1 className="career-poster-name" variants={rise}>
          {overview.shikona}
        </motion.h1>
        <motion.div className="career-poster-rank" variants={rise}>
          {highestRankLabel}
        </motion.div>
        <motion.div className="career-poster-origin" variants={rise}>
          {overview.birthplace} / {overview.stableName}
        </motion.div>
        <motion.div className="career-poster-statline" variants={rise}>
          <span className="career-poster-stat-item">
            <span className="career-poster-stat-label">通算</span>
            <span className="career-poster-stat-value">{overview.totalRecordLabel}</span>
          </span>
          <span className="career-poster-stat-divider" />
          <span className="career-poster-stat-item">
            <span className="career-poster-stat-label">勝率</span>
            <span className="career-poster-stat-value">{overview.winRateLabel}</span>
          </span>
        </motion.div>
        <motion.p className="career-poster-summary" variants={rise}>
          {overview.lifeSummary}
        </motion.p>
      </div>

      <motion.div className="career-poster-portrait-dock" variants={rise}>
        <RikishiPortrait
          bodyType={status.bodyType}
          className="career-poster-portrait"
          innerClassName="career-poster-portrait-inner"
          presentation="blend"
        />
      </motion.div>
    </motion.div>

    <motion.div
      className="career-poster-slit"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.22, duration: 0.22, ease: "easeOut" }}
    >
      {!isSaved ? (
        <div className="career-decision-band">
          <div>
            <div className="career-decision-kicker">今やること</div>
            <div className="career-decision-copy">
              この人生を保存するか、保存せず次の新弟子へ進むかを先に決めます。
            </div>
          </div>
          <div className="career-decision-actions">
            <Button size="lg" onClick={() => void onSave()}>
              <Save className="mr-2 h-4 w-4" />
              この人生を保存する
            </Button>
            <Button variant="outline" onClick={onReturnToScout}>
              保存せず次の新弟子へ
            </Button>
          </div>
        </div>
      ) : (
        <div className="career-return-strip">
          <Button variant="ghost" size="sm" onClick={onReturnToScout}>
            新弟子設計へ戻る
          </Button>
        </div>
      )}

      <div className="career-reading-nav">
        <div className="career-reading-nav-copy">
          <div className="career-decision-kicker">詳しく読む</div>
          <div className="career-decision-copy">
            判断のあとで、番付推移や各場所の詳細を読み返せます。
          </div>
        </div>
        <div className="career-reading-nav-actions">
          <Button variant="secondary" onClick={() => onOpenChapter("trajectory", selectedPoint?.bashoSeq)}>
            <ScrollText className="mr-2 h-4 w-4" />
            番付推移
          </Button>
          <Button variant="outline" onClick={() => onOpenChapter("place", selectedPoint?.bashoSeq)}>
            <Table2 className="mr-2 h-4 w-4" />
            場所別
          </Button>
          <Button variant="ghost" onClick={() => onOpenChapter("review", selectedPoint?.bashoSeq)}>
            <Scale className="mr-2 h-4 w-4" />
            審議録
          </Button>
          <Button variant="ghost" onClick={onOpenEra}>
            <TableProperties className="mr-2 h-4 w-4" />
            時代統計
          </Button>
        </div>
      </div>

      <div className="career-poster-slit-head">
        <div className="career-poster-slit-title">履歴</div>
        <div className="career-poster-slit-caption">
          {selectedPoint
            ? `${selectedPoint.bashoLabel} / ${selectedPoint.rankLabel} / ${selectedPoint.recordLabel}`
            : "場所を選択"}
        </div>
      </div>
      <div className="career-poster-slit-track">
        {ledger.points.map((point) => (
          <button
            key={`mini-${point.bashoSeq}`}
            type="button"
            className="career-poster-slit-mark"
            data-band={point.bandKey}
            data-selected={point.bashoSeq === selectedPoint?.bashoSeq}
            title={`${point.bashoLabel} / ${point.rankLabel} / ${point.recordLabel}`}
            onClick={() => {
              onSelectBasho(point.bashoSeq);
              onOpenChapter("place", point.bashoSeq);
            }}
          >
            <span>{point.rankShortLabel}</span>
          </button>
        ))}
      </div>
    </motion.div>
  </section>
);
