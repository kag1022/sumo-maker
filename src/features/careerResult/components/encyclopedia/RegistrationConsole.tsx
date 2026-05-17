import React from "react";
import { Archive, Check, Copy, ExternalLink, Save } from "lucide-react";
import { type CareerSaveTag } from "../../../../logic/models";
import {
  AUTO_TAG_LABELS,
  MANUAL_SAVE_TAG_LABELS,
  type CareerAnalysisSummary,
} from "../../../../logic/career/analysis";
import type { CareerClearScoreSummary } from "../../../../logic/career/clearScore";
import { useLocale } from "../../../../shared/hooks/useLocale";
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

const MANUAL_SAVE_TAG_EN_LABELS: Record<CareerSaveTag, string> = {
  GREAT_RIKISHI: "Great rikishi",
  UNFINISHED_TALENT: "Unfinished talent",
  LATE_BLOOM_SUCCESS: "Late bloom",
  INJURY_TRAGEDY: "Injury shadow",
  TURBULENT_LIFE: "Turbulent career",
  STABLE_MAKUUCHI: "Stable makuuchi",
  JURYO_CRAFTSMAN: "Juryo craft",
  GENERATION_LEADER: "Generation leader",
  RIVALRY_MEMORY: "Memorable rivalry",
  RARE_RECORD: "Rare record",
  RESEARCH_SAMPLE: "Research sample",
  FAVORITE: "Favorite",
  MEMORABLE_SUPPORT: "Memorable support",
  UNEXPECTED: "Unexpected",
  REREAD: "Reread",
};

const AUTO_TAG_EN_LABELS: Record<keyof typeof AUTO_TAG_LABELS, string> = {
  LATE_BLOOM: "Late bloom",
  INJURY_COMEBACK: "Injury comeback",
  STABLE_TOP_DIVISION: "Stable top division",
  JURYO_CRAFT: "Juryo craft",
  TURBULENT: "Turbulent",
  RARE_RECORD: "Rare record",
  LONGEVITY: "Longevity",
  FAST_RISE: "Fast rise",
  SANYAKU_NEAR_MISS: "Sanyaku near miss",
  RIVALRY: "Rivalry",
};

const CLASSIFICATION_EN_LABELS: Record<string, string> = {
  名力士: "Great rikishi",
  三役中核: "Sanyaku core",
  安定幕内: "Stable makuuchi",
  十両職人: "Juryo craft",
  未完の大器: "Unfinished talent",
  怪我に泣いた力士: "Injury-shadowed career",
  波乱型: "Turbulent career",
  長寿型: "Long career",
  短期爆発型: "Short burst",
  記憶に残る脇役: "Memorable supporting career",
  標準記録: "Standard record",
};

const CATEGORY_EN_LABELS: Record<string, string> = {
  最高位: "Peak Rank",
  優勝: "Yusho",
  通算成績: "Career Record",
  在位: "Tenure",
  表彰: "Awards",
  希少性: "Rarity",
  安定性: "Stability",
};

const JAPANESE_TEXT_PATTERN = /[ぁ-んァ-ン一-龥]/;

const textForEnglish = (value: string | null | undefined, fallback: string): string =>
  !value || JAPANESE_TEXT_PATTERN.test(value) ? fallback : value;

const formatManualSaveTag = (tag: CareerSaveTag, locale: "ja" | "en"): string =>
  locale === "en" ? MANUAL_SAVE_TAG_EN_LABELS[tag] ?? tag : MANUAL_SAVE_TAG_LABELS[tag];

const formatAutoTag = (tag: keyof typeof AUTO_TAG_LABELS, locale: "ja" | "en"): string =>
  locale === "en" ? AUTO_TAG_EN_LABELS[tag] ?? tag : AUTO_TAG_LABELS[tag];

const formatClassification = (label: string, locale: "ja" | "en"): string =>
  locale === "en" ? CLASSIFICATION_EN_LABELS[label] ?? textForEnglish(label, "Saved career") : label;

const formatScoreCategory = (label: string, locale: "ja" | "en"): string =>
  locale === "en" ? CATEGORY_EN_LABELS[label] ?? textForEnglish(label, "Score Category") : label;

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
  const { locale } = useLocale();
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
    ? locale === "en" ? "Saved" : "保存済み"
    : !detailReady
      ? locale === "en" ? "Building" : "整理中"
      : saveState === "saving"
        ? locale === "en" ? "Saving" : "保存中"
        : locale === "en" ? "Ready to Save" : "保存可能";

  const judgementCopy = !detailReady
    ? locale === "en"
      ? `Detail records are still building (${saveProgressLabel}). The score can be read now; saving unlocks after details are ready.`
      : `詳細記録を整理中です (${saveProgressLabel})。総評点は読めますが、保存は整理完了後にできます。`
    : locale === "en"
      ? `Class: ${formatClassification(analysis.classificationLabel, locale)}. This career is useful as a saved comparison record.`
      : `分類「${analysis.classificationLabel}」。比較母集団に加える価値があります。`;

  const headLed: SignalLedState = isSaved ? "active" : !detailReady ? "info" : "active";

  return (
    <BracketFrame variant="console" padding="zero">
      <div className={styles.console}>
        <div className={styles.scorePane}>
          <ModuleHeader
            kicker={locale === "en" ? "Evaluation" : "評価"}
            title={locale === "en" ? "Record Score" : "総評点"}
            copy={locale === "en" ? "This score is used to sort saved career records." : "保存後の記録で並び替えに使う評価です。"}
            led={headLed}
            statusTag={statusTag}
          />
          <div className={styles.scoreReadout}>
            <div className={styles.scoreLabelGroup}>
              <div className={styles.scoreCaption}>
                <SignalLed state="active" size="sm" />
                <span>{locale === "en" ? "Record Value" : "記録価値"}</span>
              </div>
              <div className={styles.scoreTitle}>{formatClassification(analysis.classificationLabel, locale)}</div>
              <p className={styles.scoreCopy}>{judgementCopy}</p>
            </div>
            <div className={styles.scoreDigitsBlock}>
              <div className={styles.scoreDigits}>
                <strong>{clearScoreSummary.clearScore}</strong>
                <em>{locale === "en" ? "pts" : "点"}</em>
              </div>
            </div>
          </div>
          <div className={styles.scoreRows} aria-label={locale === "en" ? "Score breakdown" : "評定内訳"}>
            {clearScoreSummary.categories.map((category) => {
              const detail =
                category.items.slice(0, 2).map((item) => item.detail).join(" / ") || category.detail;
              return (
                <div key={category.key} className={styles.scoreRow}>
                  <div className={styles.scoreRowTop}>
                    <span>{formatScoreCategory(category.label, locale)}</span>
                    <strong>+{category.score}</strong>
                  </div>
                  <p>{locale === "en" ? textForEnglish(detail, "This category contributes to the saved-record score.") : detail}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.tagsPane}>
          <ModuleHeader
            kicker={locale === "en" ? "Save" : "保存"}
            title={locale === "en" ? "Archive Tags" : "分類タグ"}
            copy={locale === "en" ? "Automatic and manual tags can be attached to the saved record." : "自動分類タグと手動分類タグを保存記録に付けられます。"}
          />

          {!isSaved ? (
            <>
              {analysis.saveRecommendation.reasons.length > 0 ? (
                <div className={styles.reasonList}>
                  {analysis.saveRecommendation.reasons.slice(0, 4).map((reason) => (
                    <div key={reason}>{locale === "en" ? textForEnglish(reason, "The record has a reason to be saved.") : reason}</div>
                  ))}
                </div>
              ) : null}

              {analysis.saveRecommendation.autoTags.length > 0 ? (
                <div className={styles.tagCloud} aria-label={locale === "en" ? "Automatic save tags" : "自動分類タグ"}>
                  {analysis.saveRecommendation.autoTags.map((tag) => (
                    <span key={tag} className={styles.autoTag}>
                      {locale === "en" ? "Auto: " : "自動："}{formatAutoTag(tag, locale)}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className={styles.tagToggleGrid} role="group" aria-label={locale === "en" ? "Manual save tags" : "手動分類タグ"}>
                {SAVE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={styles.tagToggle}
                    data-active={selectedSaveTags.includes(tag)}
                    data-suggested={analysis.saveRecommendation.suggestedManualTags.includes(tag)}
                    onClick={() => toggleSaveTag(tag)}
                  >
                    {formatManualSaveTag(tag, locale)}
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
                  {!detailReady
                    ? locale === "en" ? "Building Details" : "詳細整理中"
                    : saveState === "saving"
                      ? locale === "en" ? "Saving" : "保存中"
                      : locale === "en" ? "Save Career" : "この一代を保存"}
                </Button>
                <Button variant="outline" onClick={onReturnToScout}>
                  {locale === "en" ? "Skip and Continue" : "保存せず次へ"}
                </Button>
                {saveState === "error" ? (
                  <div className={styles.saveError}>{locale === "en" ? "Save failed. Please retry." : "保存に失敗しました。再試行してください。"}</div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className={styles.savedState}>
                <Check className="h-5 w-5" />
                <div>
                  <span>{locale === "en" ? "Saved" : "保存済み"}</span>
                  <strong>{locale === "en" ? "This career is preserved in the archive." : "この一代は保存済み記録に残っています。"}</strong>
                </div>
              </div>
              <p className={styles.decisionCopy}>
                {locale === "en"
                  ? "Saved records can be reread, compared, and searched for similar careers. Start another rikishi or open the archive."
                  : "保存済み記録から再読、比較、類似検索に進めます。次の力士を生成するか、保存済み記録を開いて参照してください。"}
              </p>
              <div className={styles.commandStack}>
                <Button size="lg" onClick={onOpenArchive}>
                  <Archive className="mr-2 h-4 w-4" />
                  {locale === "en" ? "Open Archive" : "保存済み記録を開く"}
                </Button>
                <Button variant="outline" onClick={onReturnToScout}>
                  {locale === "en" ? "Next Rikishi" : "次の力士へ"}
                </Button>
              </div>
            </>
          )}

          {import.meta.env.DEV ? (
            <div className={styles.devCommands}>
              <Button variant="secondary" size="sm" onClick={() => void handleCopyReport()}>
                <Copy className="mr-2 h-4 w-4" />
                {copyState === "copied" ? (locale === "en" ? "Copied" : "コピー済") : (locale === "en" ? "Debug Info" : "検証情報")}
              </Button>
              <a href={FEEDBACK_FORM_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                {locale === "en" ? "Feedback Form" : "検証フォーム"}
              </a>
              {copyState === "error" ? <span>{locale === "en" ? "Copy failed." : "コピーに失敗しました。"}</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </BracketFrame>
  );
};
