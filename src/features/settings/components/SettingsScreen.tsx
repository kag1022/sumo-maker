import React from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "../../../shared/ui/Button";

interface SettingsScreenProps {
  onClearAllData: () => Promise<void>;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClearAllData }) => {
  const [isClearing, setIsClearing] = React.useState(false);

  const handleClear = React.useCallback(async () => {
    const acceptedFirst = window.confirm("保存済み記録、資料館、設定中の一代をすべて削除します。続けますか。");
    if (!acceptedFirst) return;
    const acceptedSecond = window.confirm("この操作は取り消せません。本当に全データを削除しますか。");
    if (!acceptedSecond) return;

    setIsClearing(true);
    try {
      await onClearAllData();
    } finally {
      setIsClearing(false);
    }
  }, [onClearAllData]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="surface-panel space-y-4">
        <div className="space-y-3">
          <div className="app-kicker">設定</div>
          <h2 className="text-3xl ui-text-heading text-text">保存データを整理する</h2>
          <p className="max-w-2xl text-sm text-text-dim">
            ここでは全データ削除だけを扱います。通常の導線や記録閲覧には影響しない場所に切り分けます。
          </p>
        </div>
      </section>

      <section className="surface-panel border border-warning/30 bg-warning/5 space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center border border-warning/30 bg-warning/10 text-warning-bright">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl ui-text-heading text-text">全データ削除</h3>
            <p className="text-sm text-text-dim">
              保存済み記録、未保存の一代、資料館の進捗、親方、財布、内部統計をまとめて削除します。
            </p>
          </div>
        </div>

        <div className="border border-white/10 bg-bg/20 px-4 py-4 text-sm text-text-dim">
          削除後はホームへ戻ります。復元はできません。
        </div>

        <Button variant="outline" onClick={() => void handleClear()} disabled={isClearing}>
          <Trash2 className="mr-2 h-4 w-4" />
          {isClearing ? "削除中..." : "全データを削除する"}
        </Button>
      </section>
    </div>
  );
};
