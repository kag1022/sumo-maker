import React from "react";
import { ArrowLeft, ArrowRight, ArrowUpDown, Crown, Waypoints } from "lucide-react";
import { Button } from "../../../shared/ui/Button";
import { CareerListItem } from "../../../logic/persistence/shared";
import { Division, RikishiStatus } from "../../../logic/models";
import type { CareerBashoRecordsBySeq } from "../../../logic/persistence/careerHistory";
import { formatBashoLabel, formatRankDisplayName } from "../../report/utils/reportShared";
import { NpcCareerPanel } from "../../shared/components/NpcCareerPanel";
import { buildNpcCareerDetail } from "../../shared/utils/npcCareerDetail";
import {
  EraPeerRow,
  buildEraTimelineBands,
  getDefaultDivision,
  getEraPeerRows,
  getSelectedBanzukeSlice,
  type EraStatsViewState,
} from "../utils/eraStatsModel";

interface EraStatsPageProps {
  status: RikishiStatus;
  careerId: string | null;
  bashoRows: CareerBashoRecordsBySeq[];
  hallOfFame: CareerListItem[];
  viewState: EraStatsViewState;
  onViewStateChange: (next: EraStatsViewState) => void;
  onOpenCareer: () => void;
}

export const EraStatsPage: React.FC<EraStatsPageProps> = ({
  status,
  careerId,
  bashoRows,
  hallOfFame,
  viewState,
  onViewStateChange,
  onOpenCareer,
}) => {
  void careerId;
  const [selectedNpcId, setSelectedNpcId] = React.useState<string | null>(null);
  const records = status.history.records
    .filter((record) => record.rank.division !== "Maezumo")
    .map((record, index) => ({ ...record, bashoSeq: index + 1 }));
  const selectedRecord =
    records.find((record) => record.bashoSeq === viewState.selectedBashoSeq) ??
    records[records.length - 1] ??
    null;
  const selectedBasho = bashoRows.find((row) => row.bashoSeq === viewState.selectedBashoSeq) ?? null;
  const banzukeSlice = React.useMemo(
    () => getSelectedBanzukeSlice(selectedBasho, viewState.selectedDivision),
    [selectedBasho, viewState.selectedDivision],
  );
  const peers = React.useMemo(
    () => getEraPeerRows(bashoRows, viewState.selectedDivision, viewState.rankingBasis),
    [bashoRows, viewState.selectedDivision, viewState.rankingBasis],
  );
  const timelineBands = React.useMemo(() => buildEraTimelineBands(records), [records]);
  const selectedNpc = React.useMemo(
    () => (selectedNpcId ? buildNpcCareerDetail(bashoRows, selectedNpcId, viewState.selectedBashoSeq) : null),
    [bashoRows, selectedNpcId, viewState.selectedBashoSeq],
  );
  const selectedIndex = Math.max(0, records.findIndex((record) => record.bashoSeq === viewState.selectedBashoSeq));
  const divisionChoices = (["Makuuchi", "Juryo", getDefaultDivision(selectedRecord?.rank.division)] as const)
    .filter((value, index, array) => array.indexOf(value) === index);

  const moveSelected = (direction: -1 | 1) => {
    const nextRecord = records[selectedIndex + direction];
    if (!nextRecord) return;
    onViewStateChange({ ...viewState, selectedBashoSeq: nextRecord.bashoSeq });
  };

  return (
    <div className="era-stats-page">
      <section className="analysis-section">
        <div className="analysis-toolbar">
          <div className="analysis-toolbar-primary">
            <span className="analysis-subtitle">{status.shikona}</span>
            <span className="analysis-caption">
              {selectedRecord ? formatBashoLabel(selectedRecord.year, selectedRecord.month) : "-"} / {divisionLabel(viewState.selectedDivision)} / 保存{hallOfFame.length}
            </span>
          </div>
          <div className="analysis-actions">
            <Button variant="secondary" onClick={onOpenCareer}>
              <Waypoints className="mr-2 h-4 w-4" />
              キャリア結果
            </Button>
          </div>
        </div>
        <div className="era-controls">
          <div className="era-navigation">
            <Button variant="ghost" size="sm" onClick={() => moveSelected(-1)} disabled={selectedIndex <= 0}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="era-current-label">
              {selectedRecord ? formatBashoLabel(selectedRecord.year, selectedRecord.month) : "-"}
            </div>
            <Button variant="ghost" size="sm" onClick={() => moveSelected(1)} disabled={selectedIndex >= records.length - 1}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="era-toggle-group">
            {divisionChoices.map((division) => (
              <Button
                key={division}
                variant={viewState.selectedDivision === division ? "primary" : "ghost"}
                size="sm"
                onClick={() => onViewStateChange({ ...viewState, selectedDivision: division })}
              >
                {divisionLabel(division)}
              </Button>
            ))}
          </div>
          <div className="era-toggle-group">
            <Button
              variant={viewState.rankingBasis === "rank" ? "primary" : "ghost"}
              size="sm"
              onClick={() => onViewStateChange({ ...viewState, rankingBasis: "rank" })}
            >
              <Crown className="mr-2 h-4 w-4" />
              番付順
            </Button>
            <Button
              variant={viewState.rankingBasis === "record" ? "primary" : "ghost"}
              size="sm"
              onClick={() => onViewStateChange({ ...viewState, rankingBasis: "record" })}
            >
              <ArrowUpDown className="mr-2 h-4 w-4" />
              成績順
            </Button>
          </div>
        </div>
        <div className="year-band-strip">
          {timelineBands.map((band) => {
            const active =
              selectedRecord != null &&
              selectedRecord.bashoSeq >= band.startSeq &&
              selectedRecord.bashoSeq <= band.endSeq;
            return (
              <button
                key={band.year}
                type="button"
                className="year-band-chip"
                data-active={active}
                style={{ flexGrow: Math.max(1, band.size) }}
                onClick={() =>
                  onViewStateChange({
                    ...viewState,
                    selectedBashoSeq: active && selectedRecord ? selectedRecord.bashoSeq : band.endSeq,
                  })}
              >
                <span>{band.label}</span>
                <span>{band.size}</span>
              </button>
            );
          })}
        </div>

        <div className="era-layout">
          <section className="flat-panel era-panel-tall">
            <div className="flat-panel-title">番付表</div>
            <div className="flat-table-scroll">
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>四股名</th>
                    <th>番付</th>
                    <th>成績</th>
                  </tr>
                </thead>
                <tbody>
                  {banzukeSlice.map((row) => (
                    <tr key={`${row.entityType}-${row.entityId}`} data-player={row.entityType === "PLAYER"}>
                      <td className="table-rikishi-name" data-player={row.entityType === "PLAYER"}>
                        {row.entityType === "NPC" ? (
                          <button type="button" className="table-link-button" onClick={() => setSelectedNpcId(row.entityId)}>
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
          </section>

          <section className="era-side-stack">
            <ListTable title="同時代力士一覧" peers={peers.slice(0, 20)} valueKey="recordLabel" onSelectNpc={setSelectedNpcId} />
            <ListTable title="ランキング" peers={peers.slice(0, 20)} valueKey="rankingValueLabel" showRank onSelectNpc={setSelectedNpcId} />
          </section>
        </div>
      </section>
      {selectedNpc ? <NpcCareerPanel detail={selectedNpc} onClear={() => setSelectedNpcId(null)} /> : null}
    </div>
  );
};

const ListTable: React.FC<{
  title: string;
  peers: EraPeerRow[];
  valueKey: "recordLabel" | "rankingValueLabel";
  showRank?: boolean;
  onSelectNpc: (entityId: string | null) => void;
}> = ({ title, peers, valueKey, showRank = false, onSelectNpc }) => (
  <section className="flat-panel flat-panel-short">
    <div className="flat-panel-title">{title}</div>
    <div className="flat-table-scroll">
      <table className="detail-table">
        <thead>
          <tr>
            {showRank ? <th>順位</th> : null}
            <th>四股名</th>
            <th>{showRank ? "値" : "通算"}</th>
          </tr>
        </thead>
        <tbody>
          {peers.map((peer, index) => (
            <tr key={`${title}-${peer.key}`} data-player={peer.isPlayer}>
              {showRank ? <td>{index + 1}</td> : null}
              <td className="table-rikishi-name" data-player={peer.isPlayer}>
                {peer.isPlayer ? (
                  peer.label
                ) : (
                  <button type="button" className="table-link-button" onClick={() => onSelectNpc(peer.key.replace(/^NPC:/, ""))}>
                    {peer.label}
                  </button>
                )}
              </td>
              <td>{peer[valueKey]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

const divisionLabel = (division: "Makuuchi" | "Juryo" | "Makushita" | "Sandanme" | "Jonidan" | "Jonokuchi") => {
  if (division === "Makuuchi") return "幕内";
  if (division === "Juryo") return "十両";
  if (division === "Makushita") return "幕下";
  if (division === "Sandanme") return "三段目";
  if (division === "Jonidan") return "序二段";
  return "序ノ口";
};
