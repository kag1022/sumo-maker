import React from "react";
import { AlertTriangle, Moon, Sun, Trash2 } from "lucide-react";
import { cn } from "../../../shared/lib/cn";
import surface from "../../../shared/styles/surface.module.css";
import typography from "../../../shared/styles/typography.module.css";
import { Button } from "../../../shared/ui/Button";
import { useTheme, type ThemeMode } from "../../../shared/hooks/useTheme";
import styles from "./SettingsScreen.module.css";

interface SettingsScreenProps {
  onClearAllData: () => Promise<void>;
}

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "dark",
    label: "ダーク",
    description: "暗い背景のテーマ。夜や暗い場所に向いています。",
    icon: Moon,
  },
  {
    id: "light",
    label: "ライト",
    description: "明るい背景のテーマ。昼間や明るい場所に向いています。",
    icon: Sun,
  },
];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClearAllData }) => {
  const [isClearing, setIsClearing] = React.useState(false);
  const { theme, setTheme } = useTheme();

  const handleClear = React.useCallback(async () => {
    const acceptedFirst = window.confirm(
      "保存済みの記録、資料館、設定中の一代をすべて削除します。続けますか？",
    );
    if (!acceptedFirst) return;
    const acceptedSecond = window.confirm("この操作は取り消せません。本当に全データを削除しますか？");
    if (!acceptedSecond) return;

    setIsClearing(true);
    try {
      await onClearAllData();
    } finally {
      setIsClearing(false);
    }
  }, [onClearAllData]);

  return (
    <div className={cn(styles.wrapper, "space-y-6")}>
      <section className={cn(surface.panel, "space-y-1")}>
        <div className={typography.kicker}>設定</div>
        <h2 className={cn(typography.heading, "text-2xl text-text")}>設定</h2>
        <p className="text-sm text-text-dim">表示テーマの変更やデータの管理ができます。</p>
      </section>

      {/* テーマ選択 */}
      <section className={cn(surface.panel, "space-y-4")}>
        <div>
          <h3 className={cn(typography.heading, "mb-1 text-base text-text")}>テーマ</h3>
          <p className="text-xs text-text-dim">切り替えは即座に反映され、次回起動時も維持されます。</p>
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
                    <span className="font-medium text-text">{option.label}</span>
                    {isActive && (
                      <span className={cn(typography.label, styles.activeBadge)}>
                        使用中
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-dim mt-0.5">{option.description}</p>
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
            <h3 className={cn(typography.heading, "mb-1 text-base text-text")}>全データ削除</h3>
            <p className="text-xs text-text-dim leading-relaxed">
              保存済みの記録・資料館の進捗・財布・内部統計をまとめて削除します。削除後はホームへ戻ります。
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void handleClear()} disabled={isClearing}>
          <Trash2 className="mr-2 h-4 w-4" />
          {isClearing ? "削除中..." : "全データを削除する"}
        </Button>
      </section>
    </div>
  );
};
