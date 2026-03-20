import React from "react";
import { getCareerBashoDetail } from "../../../logic/persistence/careerHistory";
import type { RikishiStatus } from "../../../logic/models";
import type { BashoDetailModalState } from "./BashoDetailModal";

export const useCareerBashoDetail = (
  careerId: string | null | undefined,
  selectedState: BashoDetailModalState | null,
  status: RikishiStatus,
) => {
  const [detail, setDetail] = React.useState<Awaited<ReturnType<typeof getCareerBashoDetail>>>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!careerId || !selectedState) {
      setDetail(null);
      setIsLoading(false);
      setErrorMessage(null);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setErrorMessage(null);
    void (async () => {
      try {
        const nextDetail = await getCareerBashoDetail(careerId, selectedState.bashoSeq);
        if (cancelled) return;
        setDetail(nextDetail);
        if (!nextDetail) {
          setErrorMessage("この場所の保存詳細は見つかりませんでした。");
        }
      } catch {
        if (!cancelled) {
          setDetail(null);
          setErrorMessage("場所詳細の取得に失敗したため、この場所だけ簡易表示になります。");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [careerId, selectedState]);

  return {
    detail,
    isLoading,
    errorMessage,
    fallbackStatus: status,
  };
};
