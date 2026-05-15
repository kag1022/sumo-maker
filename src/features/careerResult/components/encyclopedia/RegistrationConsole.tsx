import React from "react";
import { Archive, Check, Copy, ExternalLink, Save } from "lucide-react";
import { type CareerSaveTag } from "../../../../logic/models";
import {
  AUTO_TAG_LABELS,
  MANUAL_SAVE_TAG_LABELS,
  type CareerAnalysisSummary,
} from "../../../../logic/career/analysis";
import type { CareerClearScoreSummary } from "../../../../logic/career/clearScore";
import { Button } from "../../../../shared/ui/Button";
import { FEEDBACK_FORM_URL } from "../../utils/releaseFeedback";
import type { CareerDesignReadingModel } from "../../utils/careerResultModel";
import { BracketFrame } from "./BracketFrame";
import { ModuleHeader } from "./ModuleHeader";
import { SignalLed, type SignalLedState } from "./SignalLed";
import styles from "./RegistrationConsole.module.css";

const SAVE_TAGS: CareerSaveTag[] = [
  "GREAT_RIKISHI",
  "UNFINISHED_TALENT",
  "LATE_BLOOM_SUCCESS",
  "INJURY_TRAGEDY",
  "TURBULENT_LIFE",
  "STABLE_MAKUUCHI",
  "JURYO_CRAFTSMAN",
  "GENERATION_LEADER",
  "RIVALRY_MEMORY",
  "RARE_RECORD",
  "RESEARCH_SAMPLE",
  "FAVORITE",
];

interface RegistrationConsoleProps {
  analysis: CareerAnalysisSummary;
  clearScoreSummary: CareerClearScoreSummary;
  designReading: CareerDesignReadingModel;
  isSaved: boolean;
  detailReady: boolean;
  saveProgressLabel: string;
  onSave: (metadata?: { saveTags?: CareerSaveTag[] }) => void | Promise<void>;
  onReturnToScout: () => void;
  onOpenArchive: () => void;
}

export const RegistrationConsole: React.FC<RegistrationConsoleProps> = ({
  analysis,
  clearScoreSummary,
  designReading,
  isSaved,
  detailReady,
  saveProgressLabel,
  onSave,
  onReturnToScout,
  onOpenArchive,
}) => {
  const [selectedSaveTags, setSelectedSaveTags] = React.useState<CareerSaveTag[]>([]);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "error">("idle");
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "error">("idle");

  React.useEffect(() => {
    setSelectedSaveTags(analysis.saveRecommendation.suggestedManualTags.slice(0, 3));
  }, [analysis.saveRecommendation.suggestedManualTags]);

  const toggleSaveTag = React.useCallback((tag: CareerSaveTag) => {
    setSelectedSaveTags((current) =>
      current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag],
    );
  }, []);

  const handleSave = React.useCallback(async () => {
    if (!detailReady || saveState === "saving") return;
    setSaveState("saving");
    try {
      await onSave({ saveTags: selectedSaveTags });
      setSaveState("idle");
    } catch {
      setSaveState("error");
    }
  }, [detailReady, onSave, saveState, selectedSaveTags]);

  const handleCopyReport = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(designReading.feedbackReportText);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
    }
  }, [designReading.feedbackReportText]);

  const statusTag = isSaved
    ? "保存済み"
    : !detailReady
      ? "整理中"
      : saveState === "saving"
        ? "保存中"
        : "保存可能";

  const judgementCopy = !detailReady
    ? `詳細記録を整理中です (${saveProgressLabel})。総評点は読めますが、保存は整理完了後にできます。`
    : `分類「${analysis.classificationLabel}」。比較母集団に加える価値があります。`;

  const headLed: SignalLedState = isSaved ? "active" : !detailReady ? "info" : "active";

  return (
    <BracketFrame variant="console" padding="zero">
      <div className={styles.console}>
        <div className={styles.scorePane}>
          <ModuleHeader
            kicker="評価"
            title="総評点"
            copy="保存後の記録で並び替えに使う評価です。"
            led={headLed}
            statusTag={statusTag}
          />
          <div className={styles.scoreReadout}>
            <div className={styles.scoreLabelGroup}>
              <div className={styles.scoreCaption}>
                <SignalLed state="active" size="sm" />
                <span>記録価値</span>
              </div>
              <div className={styles.scoreTitle}>{analysis.classificationLabel}</div>
              <p className={styles.scoreCopy}>{judgementCopy}</p>
            </div>
            <div className={styles.scoreDigitsBlock}>
              <div className={styles.scoreDigits}>
                <strong>{clearScoreSummary.clearScore}</strong>
                <em>点</em>
              </div>
            </div>
          </div>
          <div className={styles.scoreRows} aria-label="評定内訳">
            {clearScoreSummary.categories.map((category) => {
              const detail =
                category.items.slice(0, 2).map((item) => item.detail).join(" / ") || category.detail;
              return (
                <div key={category.key} className={styles.scoreRow}>
                  <div className={styles.scoreRowTop}>
                    <span>{category.label}</span>
                    <strong>+{category.score}</strong>
                  </div>
                  <p>{detail}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.tagsPane}>
          <ModuleHeader
            kicker="保存"
            title="分類タグ"
            copy="自動分類タグと手動分類タグを保存記録に付けられます。"
          />

          {!isSaved ? (
            <>
              {analysis.saveRecommendation.reasons.length > 0 ? (
                <div className={styles.reasonList}>
                  {analysis.saveRecommendation.reasons.slice(0, 4).map((reason) => (
                    <div key={reason}>{reason}</div>
                  ))}
                </div>
              ) : null}

              {analysis.saveRecommendation.autoTags.length > 0 ? (
                <div className={styles.tagCloud} aria-label="自動分類タグ">
                  {analysis.saveRecommendation.autoTags.map((tag) => (
                    <span key={tag} className={styles.autoTag}>
                      自動：{AUTO_TAG_LABELS[tag]}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className={styles.tagToggleGrid} role="group" aria-label="手動分類タグ">
                {SAVE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={styles.tagToggle}
                    data-active={selectedSaveTags.includes(tag)}
                    data-suggested={analysis.saveRecommendation.suggestedManualTags.includes(tag)}
                    onClick={() => toggleSaveTag(tag)}
                  >
                    {MANUAL_SAVE_TAG_LABELS[tag]}
                  </button>
                ))}
              </div>

              <div className={styles.commandStack}>
                <Button
                  size="lg"
                  disabled={!detailReady || saveState === "saving"}
                  onClick={() => void handleSave()}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {!detailReady ? "詳細整理中" : saveState === "saving" ? "保存中" : "この一代を保存"}
                </Button>
                <Button variant="outline" onClick={onReturnToScout}>
                  保存せず次へ
                </Button>
                {saveState === "error" ? (
                  <div className={styles.saveError}>保存に失敗しました。再試行してください。</div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className={styles.savedState}>
                <Check className="h-5 w-5" />
                <div>
                  <span>保存済み</span>
                  <strong>この一代は保存済み記録に残っています。</strong>
                </div>
              </div>
              <p className={styles.decisionCopy}>
                保存済み記録から再読、比較、類似検索に進めます。次の力士を生成するか、保存済み記録を開いて参照してください。
              </p>
              <div className={styles.commandStack}>
                <Button size="lg" onClick={onOpenArchive}>
                  <Archive className="mr-2 h-4 w-4" />
                  保存済み記録を開く
                </Button>
                <Button variant="outline" onClick={onReturnToScout}>
                  次の力士へ
                </Button>
              </div>
            </>
          )}

          {import.meta.env.DEV ? (
            <div className={styles.devCommands}>
              <Button variant="secondary" size="sm" onClick={() => void handleCopyReport()}>
                <Copy className="mr-2 h-4 w-4" />
                {copyState === "copied" ? "コピー済" : "検証情報"}
              </Button>
              <a href={FEEDBACK_FORM_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                検証フォーム
              </a>
              {copyState === "error" ? <span>コピーに失敗しました。</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </BracketFrame>
  );
};
