import React from "react";
import { Save, TableProperties } from "lucide-react";
import { Button } from "../../../shared/ui/Button";
import { CareerBashoDetail, CareerBashoRecordsBySeq } from "../../../logic/persistence/careerHistory";
import { Division, RikishiStatus } from "../../../logic/models";
import { formatRankDisplayName } from "../../report/utils/reportShared";
import { NpcCareerPanel } from "../../shared/components/NpcCareerPanel";
import { buildNpcCareerDetail } from "../../shared/utils/npcCareerDetail";
import {
  buildCareerYearBands,
  getCareerValueForFlow,
  groupNearbyRanks,
  type CareerRankFlowPoint,
  type CareerWindowState,
} from "../utils/careerResultModel";

export interface CareerResultViewState extends CareerWindowState {
  selectedBashoSeq: number | null;
}

interface CareerResultPageProps {
  status: RikishiStatus;
  careerId: string | null;
  isSaved: boolean;
  detail: CareerBashoDetail | null;
  detailLoading: boolean;
  bashoRows: CareerBashoRecordsBySeq[];
  viewState: CareerResultViewState;
  onSelectBasho: (bashoSeq: number) => void;
  onWindowChange: (window: CareerWindowState) => void;
  onSave: () => void | Promise<void>;
  onOpenEra: () => void;
}

const VISIBLE_COLUMNS_MIN = 14;

export const CareerResultPage: React.FC<CareerResultPageProps> = ({
  status,
  careerId,
  isSaved,
  detail,
  detailLoading,
  bashoRows,
  viewState,
  onSelectBasho,
  onWindowChange,
  onSave,
  onOpenEra,
}) => {
  const [selectedNpcId, setSelectedNpcId] = React.useState<string | null>(null);
  const flow = React.useMemo(() => getCareerValueForFlow(status), [status]);
  const selectedPoint = flow.find((point) => point.bashoSeq === viewState.selectedBashoSeq) ?? flow[flow.length - 1] ?? null;
  const careerPeriod = flow.length > 0 ? `${flow[0].bashoLabel} - ${flow[flow.length - 1].bashoLabel}` : "-";
  const yearBands = React.useMemo(() => buildCareerYearBands(flow), [flow]);
  const visibleFlow = React.useMemo(
    () =>
      flow.filter(
        (point) =>
          point.bashoSeq >= viewState.visibleWindowStartSeq &&
          point.bashoSeq <= viewState.visibleWindowEndSeq,
      ),
    [flow, viewState.visibleWindowEndSeq, viewState.visibleWindowStartSeq],
  );
  const selectedNpc = React.useMemo(
    () => (selectedNpcId ? buildNpcCareerDetail(bashoRows, selectedNpcId, viewState.selectedBashoSeq) : null),
    [bashoRows, selectedNpcId, viewState.selectedBashoSeq],
  );

  return (
    <div className="career-result-page">
      <section className="analysis-header-strip">
        <div className="analysis-summary">
          <MetricBlock label="四股名" value={status.shikona} />
          <MetricBlock label="最高位" value={formatRankDisplayName(status.history.maxRank)} />
          <MetricBlock
            label="通算"
            value={`${status.history.totalWins}勝${status.history.totalLosses}敗${status.history.totalAbsent > 0 ? `${status.history.totalAbsent}休` : ""}`}
          />
          <MetricBlock label="キャリア期間" value={careerPeriod} />
        </div>
        <div className="analysis-actions">
          {!isSaved ? (
            <Button onClick={() => void onSave()}>
              <Save className="mr-2 h-4 w-4" />
              保存
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onOpenEra}>
            <TableProperties className="mr-2 h-4 w-4" />
            時代統計
          </Button>
        </div>
      </section>

      <section className="analysis-section analysis-section-graph">
        <div className="analysis-toolbar">
          <div className="analysis-toolbar-primary">
            <span className="analysis-subtitle">番付変動</span>
            <span className="analysis-caption">
              {visibleFlow[0]?.bashoLabel ?? "-"} - {visibleFlow[visibleFlow.length - 1]?.bashoLabel ?? "-"}
            </span>
          </div>
          <WindowControls totalCount={flow.length} viewState={viewState} onWindowChange={onWindowChange} />
        </div>
        <div className="year-band-strip">
          {yearBands.map((band) => {
            const active =
              band.startSeq <= viewState.visibleWindowEndSeq && band.endSeq >= viewState.visibleWindowStartSeq;
            const hasSelected =
              viewState.selectedBashoSeq != null &&
              viewState.selectedBashoSeq >= band.startSeq &&
              viewState.selectedBashoSeq <= band.endSeq;
            return (
              <button
                key={band.year}
                type="button"
                className="year-band-chip"
                data-active={active}
                data-selected={hasSelected}
                style={{ flexGrow: Math.max(1, band.size) }}
                onClick={() => {
                  onWindowChange({
                    visibleWindowStartSeq: band.startSeq,
                    visibleWindowEndSeq: band.endSeq,
                  });
                  onSelectBasho(hasSelected && viewState.selectedBashoSeq ? viewState.selectedBashoSeq : band.endSeq);
                }}
              >
                <span>{band.label}</span>
                <span>{band.size}</span>
              </button>
            );
          })}
        </div>
        <div className="analysis-subsection">
          <RankBandChart
            flow={visibleFlow}
            selectedBashoSeq={viewState.selectedBashoSeq}
            onSelectBasho={onSelectBasho}
          />
        </div>

      </section>

      <section className="analysis-section analysis-section-detail">
        {selectedPoint ? (
          <BashoDetailPanel
            point={selectedPoint}
            detail={detail}
            isLoading={detailLoading}
            hasPersistence={Boolean(careerId)}
            onSelectNpc={setSelectedNpcId}
          />
        ) : null}
      </section>
      {selectedNpc ? <NpcCareerPanel detail={selectedNpc} onClear={() => setSelectedNpcId(null)} /> : null}
    </div>
  );
};

const RankBandChart: React.FC<{
  flow: CareerRankFlowPoint[];
  selectedBashoSeq: number | null;
  onSelectBasho: (bashoSeq: number) => void;
}> = ({ flow, selectedBashoSeq, onSelectBasho }) => {
  if (flow.length === 0) return null;

  const min = Math.min(...flow.map((point) => point.rankValue));
  const max = Math.max(...flow.map((point) => point.rankValue));
  const width = Math.max(720, flow.length * 46);
  const height = 300;
  const topPad = 18;
  const bottomPad = 46;
  const leftPad = 10;
  const innerHeight = height - topPad - bottomPad;
  const step = flow.length > 1 ? (width - leftPad * 2) / (flow.length - 1) : width - leftPad * 2;
  const normalizeY = (rankValue: number) => {
    if (max === min) return topPad + innerHeight / 2;
    return topPad + ((rankValue - min) / (max - min)) * innerHeight;
  };
  const points = flow.map((point, index) => ({
    ...point,
    x: leftPad + index * step,
    y: normalizeY(point.rankValue),
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const selectedPoint = points.find((point) => point.bashoSeq === selectedBashoSeq) ?? points[points.length - 1];
  const axisPoints = [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]].filter(Boolean);

  return (
    <div className="trajectory-chart">
      <div className="trajectory-axis">
        <div className="trajectory-axis-label">{flow[0]?.rankLabel ?? "-"}</div>
        <div className="trajectory-axis-label trajectory-axis-label-current">{selectedPoint?.rankLabel ?? "-"}</div>
        <div className="trajectory-axis-label">{flow[flow.length - 1]?.rankLabel ?? "-"}</div>
      </div>
      <div className="trajectory-canvas-wrap">
        <svg className="trajectory-canvas" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {[0, 0.5, 1].map((ratio) => {
            const y = topPad + innerHeight * ratio;
            return <line key={ratio} x1={0} x2={width} y1={y} y2={y} className="trajectory-grid-line" />;
          })}
          <path d={path} className="trajectory-line-shadow" />
          <path d={path} className="trajectory-line" />
          {points.map((point) => (
            <g key={point.bashoSeq}>
              {point.eventFlags.length > 0 ? (
                <circle cx={point.x} cy={Math.max(10, point.y - 12)} r={3.5} className="trajectory-event-dot" />
              ) : null}
              <circle
                cx={point.x}
                cy={point.y}
                r={point.bashoSeq === selectedBashoSeq ? 6 : 4}
                className="trajectory-point"
                data-selected={point.bashoSeq === selectedBashoSeq}
                data-movement={point.movementType}
                onClick={() => onSelectBasho(point.bashoSeq)}
              />
            </g>
          ))}
          {axisPoints.map((point) => (
            <text key={`tick-${point.bashoSeq}`} x={point.x} y={height - 14} textAnchor="middle" className="trajectory-tick">
              {point.axisLabel}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
};

const WindowControls: React.FC<{
  totalCount: number;
  viewState: CareerResultViewState;
  onWindowChange: (window: CareerWindowState) => void;
}> = ({ totalCount, viewState, onWindowChange }) => {
  const size = viewState.visibleWindowEndSeq - viewState.visibleWindowStartSeq + 1;
  const shiftWindow = (direction: -1 | 1) => {
    const start = Math.max(1, Math.min(totalCount - size + 1, viewState.visibleWindowStartSeq + direction * Math.max(3, Math.floor(size / 3))));
    onWindowChange({
      visibleWindowStartSeq: start,
      visibleWindowEndSeq: Math.min(totalCount, start + size - 1),
    });
  };
  const widenWindow = (delta: number) => {
    const nextSize = Math.max(VISIBLE_COLUMNS_MIN, Math.min(totalCount, size + delta));
    const center = Math.floor((viewState.visibleWindowStartSeq + viewState.visibleWindowEndSeq) / 2);
    const start = Math.max(1, Math.min(totalCount - nextSize + 1, center - Math.floor(nextSize / 2)));
    onWindowChange({
      visibleWindowStartSeq: start,
      visibleWindowEndSeq: Math.min(totalCount, start + nextSize - 1),
    });
  };

  return (
    <div className="window-controls">
      <Button variant="ghost" size="sm" onClick={() => shiftWindow(-1)}>←</Button>
      <Button variant="ghost" size="sm" onClick={() => shiftWindow(1)}>→</Button>
      <Button variant="ghost" size="sm" onClick={() => widenWindow(-6)}>拡大</Button>
      <Button variant="ghost" size="sm" onClick={() => widenWindow(6)}>圧縮</Button>
    </div>
  );
};

const BashoDetailPanel: React.FC<{
  point: CareerRankFlowPoint;
  detail: CareerBashoDetail | null;
  isLoading: boolean;
  hasPersistence: boolean;
  onSelectNpc: (entityId: string | null) => void;
}> = ({ point, detail, isLoading, hasPersistence, onSelectNpc }) => {
  const groupedRows = React.useMemo(() => {
    if (!detail?.rows?.length || !detail.playerRecord) return [];
    return groupNearbyRanks(detail.rows, detail.playerRecord, 3);
  }, [detail]);

  return (
    <div className="detail-panel-grid">
      <div className="detail-panel detail-panel-summary">
        <div className="detail-summary-grid">
          <MetricBlock label="場所" value={point.bashoLabel} />
          <MetricBlock label="番付" value={point.rankLabel} />
          <MetricBlock label="成績" value={point.recordLabel} />
          <MetricBlock label="変動" value={point.delta > 0 ? `+${point.delta}` : `${point.delta}`} />
        </div>
      </div>

      <div className="detail-panel">
        <div className="detail-panel-title">上下番付</div>
        {isLoading ? (
          <div className="detail-empty">読込中</div>
        ) : groupedRows.length > 0 ? (
          <div className="detail-table-scroll">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>四股名</th>
                  <th>番付</th>
                  <th>成績</th>
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((row) => (
                  <tr key={`${row.entityType}-${row.entityId}`} data-player={row.entityType === "PLAYER"}>
                    <td>
                      {row.entityType === "NPC" ? (
                        <button type="button" className="table-link-button" onClick={() => onSelectNpc(row.entityId)}>
                          {row.shikona}
                        </button>
                      ) : (
                        row.shikona
                      )}
                    </td>
                    <td>{formatRankDisplayName({ division: row.division as Division, name: row.rankName, number: row.rankNumber ?? undefined, side: row.rankSide ?? undefined })}</td>
                    <td>{row.wins}勝{row.losses}敗{row.absent > 0 ? `${row.absent}休` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="detail-empty">{hasPersistence ? "該当データなし" : "保存後に利用可能"}</div>
        )}
      </div>

      <div className="detail-panel">
        <div className="detail-panel-title">全取組</div>
        {isLoading ? (
          <div className="detail-empty">読込中</div>
        ) : detail?.bouts?.length ? (
          <div className="detail-bouts-scroll">
            {detail.bouts.map((bout) => (
              <div key={`${bout.day}-${bout.opponentId ?? bout.opponentShikona ?? bout.result}`} className="detail-bout-row">
                <div>{bout.day}日目</div>
                <div>
                  {bout.opponentId ? (
                    <button type="button" className="table-link-button" onClick={() => onSelectNpc(bout.opponentId ?? null)}>
                      {bout.opponentShikona ?? "対戦相手なし"}
                    </button>
                  ) : (
                    bout.opponentShikona ?? "対戦相手なし"
                  )}
                  {bout.opponentRankName
                    ? ` / ${formatRankDisplayName({ division: point.rank.division, name: bout.opponentRankName, number: bout.opponentRankNumber ?? undefined, side: bout.opponentRankSide ?? undefined })}`
                    : ""}
                </div>
                <div>
                  {bout.result}
                  {bout.kimarite ? ` / ${bout.kimarite}` : ""}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="detail-empty">{hasPersistence ? "取組データなし" : "保存後に利用可能"}</div>
        )}
      </div>
    </div>
  );
};

const MetricBlock: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="analysis-metric">
    <div className="analysis-metric-label">{label}</div>
    <div className="analysis-metric-value">{value}</div>
  </div>
);
