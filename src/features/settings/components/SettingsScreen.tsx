import React from "react";
import { AlertTriangle, Languages, Moon, Sun, Trash2 } from "lucide-react";
import { cn } from "../../../shared/lib/cn";
import surface from "../../../shared/styles/surface.module.css";
import typography from "../../../shared/styles/typography.module.css";
import { Button } from "../../../shared/ui/Button";
import { useLocale } from "../../../shared/hooks/useLocale";
import type { LocaleCode } from "../../../shared/lib/locale";
import { useTheme, type ThemeMode } from "../../../shared/hooks/useTheme";
import styles from "./SettingsScreen.module.css";

interface SettingsScreenProps {
  onClearAllData: () => Promise<void>;
}

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: Record<LocaleCode, string>;
  description: Record<LocaleCode, string>;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "dark",
    label: { ja: "ダーク", en: "Dark" },
    description: {
      ja: "暗い背景のテーマ。夜や暗い場所に向いています。",
      en: "A dark theme for low-light play.",
    },
    icon: Moon,
  },
  {
    id: "light",
    label: { ja: "ライト", en: "Light" },
    description: {
      ja: "明るい背景のテーマ。昼間や明るい場所に向いています。",
      en: "A bright theme for daytime play.",
    },
    icon: Sun,
  },
];

const LANGUAGE_OPTIONS: Array<{
  id: LocaleCode;
  label: string;
  description: Record<LocaleCode, string>;
}> = [
  {
    id: "ja",
    label: "日本語",
    description: {
      ja: "相撲用語と記録文を日本語で表示します。",
      en: "Shows sumo terms and record text in Japanese.",
    },
  },
  {
    id: "en",
    label: "English",
    description: {
      ja: "主要プレイ導線を英語で表示します。",
      en: "Shows the main play flow in English.",
    },
  },
];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClearAllData }) => {
  const [isClearing, setIsClearing] = React.useState(false);
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();

  const handleClear = React.useCallback(async () => {
    const acceptedFirst = window.confirm(
      locale === "en"
        ? "This will delete saved careers, collection progress, and the current draft. Continue?"
        : "保存済みの記録、資料館、設定中の一代をすべて削除します。続けますか？",
    );
    if (!acceptedFirst) return;
    const acceptedSecond = window.confirm(
      locale === "en"
        ? "This action cannot be undone. Delete all data?"
        : "この操作は取り消せません。本当に全データを削除しますか？",
    );
    if (!acceptedSecond) return;

    setIsClearing(true);
    try {
      await onClearAllData();
    } finally {
      setIsClearing(false);
    }
  }, [locale, onClearAllData]);

  return (
    <div className={cn(styles.wrapper, "space-y-6")}>
      <section className={cn(surface.panel, "space-y-1")}>
        <div className={typography.kicker}>{locale === "en" ? "Settings" : "設定"}</div>
        <h2 className={cn(typography.heading, "text-2xl text-text")}>{locale === "en" ? "Settings" : "設定"}</h2>
        <p className="text-sm text-text-dim">
          {locale === "en" ? "Change display preferences and manage local data." : "表示テーマの変更やデータの管理ができます。"}
        </p>
      </section>

      {/* テーマ選択 */}
      <section className={cn(surface.panel, "space-y-4")}>
        <div>
          <h3 className={cn(typography.heading, "mb-1 text-base text-text")}>{locale === "en" ? "Theme" : "テーマ"}</h3>
          <p className="text-xs text-text-dim">
            {locale === "en"
              ? "Changes apply immediately and are kept for the next launch."
              : "切り替えは即座に反映され、次回起動時も維持されます。"}
          </p>
        </div>
        <div className={styles.themeGrid}>
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = theme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                className={styles.themeCard}
                data-active={isActive}
                aria-pressed={isActive}
              >
                <span className={styles.themeIcon}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text">{option.label[locale]}</span>
                    {isActive && (
                      <span className={cn(typography.label, styles.activeBadge)}>
                        {locale === "en" ? "Active" : "使用中"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-dim mt-0.5">{option.description[locale]}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 言語選択 */}
      <section className={cn(surface.panel, "space-y-4")}>
        <div>
          <h3 className={cn(typography.heading, "mb-1 text-base text-text")}>{locale === "en" ? "Language" : "言語"}</h3>
          <p className="text-xs text-text-dim">
            {locale === "en"
              ? "Language changes apply to the main play flow immediately."
              : "主要プレイ導線の表示言語を切り替えます。"}
          </p>
        </div>
        <div className={styles.themeGrid}>
          {LANGUAGE_OPTIONS.map((option) => {
            const isActive = locale === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setLocale(option.id)}
                className={styles.themeCard}
                data-active={isActive}
                aria-pressed={isActive}
              >
                <span className={styles.themeIcon}>
                  <Languages className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text">{option.label}</span>
                    {isActive && (
                      <span className={cn(typography.label, styles.activeBadge)}>
                        {locale === "en" ? "Active" : "使用中"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-dim mt-0.5">{option.description[locale]}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* データ削除 */}
      <section className={cn(surface.panel, styles.warningPanel, "space-y-4")}>
        <div className="flex items-start gap-3">
          <div className={styles.warningIcon}>
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h3 className={cn(typography.heading, "mb-1 text-base text-text")}>{locale === "en" ? "Delete All Data" : "全データ削除"}</h3>
            <p className="text-xs text-text-dim leading-relaxed">
              {locale === "en"
                ? "Deletes saved records, collection progress, wallet data, and internal stats. You will return home after deletion."
                : "保存済みの記録・資料館の進捗・財布・内部統計をまとめて削除します。削除後はホームへ戻ります。"}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void handleClear()} disabled={isClearing}>
          <Trash2 className="mr-2 h-4 w-4" />
          {isClearing
            ? locale === "en" ? "Deleting..." : "削除中..."
            : locale === "en" ? "Delete all data" : "全データを削除する"}
        </Button>
      </section>
    </div>
  );
};
