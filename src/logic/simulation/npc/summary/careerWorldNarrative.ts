import type {
  CareerRaritySummary,
  CareerWorldSummary,
  EraStarNpcSummary,
  NotableNpcSummary,
} from "./types";

// User-facing ViewModel layer for CareerWorldSection.
// Translates raw numeric scores / reasonCodes into natural Japanese sentences.

export interface CareerPositionViewModel {
  highestRankLabel: string;
  positionText: string;
  title: string;
  careerTypeLabel: string;
}

export interface KeyNpcCard {
  kind: "rival" | "peerLeader" | "eraTop";
  heading: string;
  shikona: string;
  metaLabel: string;
  description: string;
  sourceId: string;
}

export interface PeerSection {
  heading: string;
  description?: string;
  members: Array<{
    id: string;
    shikona: string;
    metaLabel: string;
    description: string;
  }>;
}

export interface EraStarViewModel {
  id: string;
  shikona: string;
  peakRankLabel: string;
  description: string;
  yushoNote?: string;
}

export interface RivalViewModel {
  id: string;
  shikona: string;
  recordLabel: string;
  description: string;
  peakRankLabel?: string;
}

const formatRecordLabel = (n: NotableNpcSummary): string =>
  n.meetings > 0
    ? `${n.meetings}戦${n.playerWins}勝${n.npcWins}敗`
    : "対戦記録なし";

const isHighRank = (label: string | undefined): boolean => {
  if (!label) return false;
  return /^(横綱|大関|関脇|小結|前頭|十両)/.test(label);
};

export const formatRivalDescription = (n: NotableNpcSummary): string => {
  const wins = n.playerWins;
  const losses = n.npcWins;
  const meetings = n.meetings;
  if (meetings === 0) return "土俵で再会する機会を逃した相手";
  if (wins === 0 && meetings >= 3) return "一度も勝てなかった壁";
  if (losses - wins >= 3) return "苦手とした宿敵";
  if (wins - losses >= 3) return "勝ち越したライバル";
  if (meetings >= 5 && wins > losses) return "何度も顔を合わせた好敵手";
  if (meetings >= 5) return "何度も土俵で交えた相手";
  if (n.rivalryKinds.includes("titleRace")) return "優勝争いでぶつかった相手";
  if (n.rivalryKinds.includes("promotionRace")) return "昇進争いでぶつかった相手";
  if (n.rivalryKinds.includes("sameGeneration")) return "同期のライバル";
  if (losses > wins) return "押され気味だった相手";
  return "幾度か土俵で当たった相手";
};

export const formatGenerationPeerDescription = (n: NotableNpcSummary): string => {
  const peak = n.peakRankLabel ?? "";
  if (/^(横綱|大関)/.test(peak)) return "同世代から最高位まで駆け上がった力士";
  if (/^(関脇|小結)/.test(peak)) return "同世代から三役まで進んだ実力者";
  if (peak.startsWith("前頭") || peak.startsWith("十両")) return "同世代で関取まで上がった力士";
  if (n.meetings >= 4) return "何度も同じ階級でぶつかった同期";
  if (n.rivalryKinds.includes("promotionRace")) return "同じ昇進の壁に挑んだ同期";
  if (n.meetings >= 1) return "土俵を共にした同期";
  return "同じ世代に番付を重ねた力士";
};

export const formatDominanceLabel = (s: EraStarNpcSummary): string => {
  const score = s.dominanceScore;
  const peak = s.peakRankLabel;
  if (peak.startsWith("横綱")) {
    if (score >= 80) return "時代を支配した横綱";
    if (score >= 30) return "この時代に君臨した横綱";
    return "この時代に名を刻んだ横綱";
  }
  if (peak.startsWith("大関")) {
    if (score >= 60) return "上位を支配した大関";
    return "この時代の大関";
  }
  if (peak.startsWith("関脇") || peak.startsWith("小結")) {
    return "上位を支えた三役";
  }
  if (peak.startsWith("前頭")) {
    return "幕内上位で長く戦った実力者";
  }
  return "この時代の上位力士";
};

export const formatEraStarYushoNote = (s: EraStarNpcSummary): string | undefined => {
  if (!s.yushoLikeCount || s.yushoLikeCount <= 0) return undefined;
  return `優勝級の活躍 ${s.yushoLikeCount}回`;
};

export const formatCareerPosition = (
  rarity: CareerRaritySummary,
): CareerPositionViewModel => {
  return {
    highestRankLabel: rarity.highestRankLabel,
    positionText: rarity.realDataPercentileText,
    title: rarity.reasonCodes[0] ?? "土俵に上がった者",
    careerTypeLabel: resolveCareerTypeLabel(rarity),
  };
};

const resolveCareerTypeLabel = (rarity: CareerRaritySummary): string => {
  switch (rarity.highestRankBucket) {
    case "横綱":
      return "頂点到達型";
    case "大関":
      return "最上位挑戦型";
    case "三役":
      return "上位定着型";
    case "幕内":
      return "幕内到達型";
    case "十両":
      return "関取到達型";
    case "幕下":
      return "関取直前型";
    case "三段目":
      return "下位上昇型";
    case "序二段":
      return "下位安定型";
    case "序ノ口":
      return "短期キャリア型";
    default:
      return "土俵経験者";
  }
};

export const selectKeyNpcCards = (
  summary: CareerWorldSummary,
): KeyNpcCard[] => {
  const cards: KeyNpcCard[] = [];

  const rival = summary.rivals[0];
  if (rival) {
    cards.push({
      kind: "rival",
      heading: "宿敵",
      shikona: rival.shikona,
      metaLabel: formatRecordLabel(rival),
      description: formatRivalDescription(rival),
      sourceId: rival.id,
    });
  }

  // peer leader: best-ranked generation peer (prefer high peak rank)
  const peerLeader = summary.generationPeers
    .slice()
    .sort((a, b) => {
      const aHigh = isHighRank(a.peakRankLabel) ? 1 : 0;
      const bHigh = isHighRank(b.peakRankLabel) ? 1 : 0;
      if (aHigh !== bHigh) return bHigh - aHigh;
      return b.rivalryScore - a.rivalryScore;
    })[0];
  if (peerLeader && peerLeader.id !== rival?.id) {
    cards.push({
      kind: "peerLeader",
      heading: "同期の出世頭",
      shikona: peerLeader.shikona,
      metaLabel: peerLeader.peakRankLabel ? `最高位 ${peerLeader.peakRankLabel}` : "同世代の力士",
      description: formatGenerationPeerDescription(peerLeader),
      sourceId: peerLeader.id,
    });
  }

  const eraTop = summary.eraStars[0];
  if (eraTop && eraTop.id !== rival?.id && eraTop.id !== peerLeader?.id) {
    cards.push({
      kind: "eraTop",
      heading: "時代の頂点",
      shikona: eraTop.shikona,
      metaLabel: eraTop.peakRankLabel,
      description: formatDominanceLabel(eraTop),
      sourceId: eraTop.id,
    });
  }

  return cards;
};

export const buildRivalViewModels = (
  summary: CareerWorldSummary,
): RivalViewModel[] =>
  summary.rivals.map((n) => ({
    id: n.id,
    shikona: n.shikona,
    recordLabel: formatRecordLabel(n),
    description: formatRivalDescription(n),
    peakRankLabel: n.peakRankLabel,
  }));

export const buildPeerSections = (
  summary: CareerWorldSummary,
): PeerSection[] => {
  const peers = summary.generationPeers;
  if (!peers.length) return [];

  const leaders: NotableNpcSummary[] = [];
  const wallSharers: NotableNpcSummary[] = [];
  const frequentMet: NotableNpcSummary[] = [];
  const others: NotableNpcSummary[] = [];

  for (const p of peers) {
    if (isHighRank(p.peakRankLabel)) leaders.push(p);
    else if (p.rivalryKinds.includes("promotionRace")) wallSharers.push(p);
    else if (p.meetings >= 3) frequentMet.push(p);
    else others.push(p);
  }

  const sections: PeerSection[] = [];
  if (leaders.length) {
    sections.push({
      heading: "同期の出世頭",
      members: leaders.slice(0, 3).map((p) => ({
        id: p.id,
        shikona: p.shikona,
        metaLabel: p.peakRankLabel ? `最高位 ${p.peakRankLabel}` : "",
        description: formatGenerationPeerDescription(p),
      })),
    });
  }
  if (wallSharers.length) {
    sections.push({
      heading: "同じ壁に挑んだ力士",
      members: wallSharers.slice(0, 3).map((p) => ({
        id: p.id,
        shikona: p.shikona,
        metaLabel: p.peakRankLabel ? `最高位 ${p.peakRankLabel}` : "",
        description: formatGenerationPeerDescription(p),
      })),
    });
  }
  if (frequentMet.length) {
    sections.push({
      heading: "よく当たった同期",
      members: frequentMet.slice(0, 3).map((p) => ({
        id: p.id,
        shikona: p.shikona,
        metaLabel: p.peakRankLabel ? `最高位 ${p.peakRankLabel}` : "",
        description: formatGenerationPeerDescription(p),
      })),
    });
  }
  if (!sections.length && others.length) {
    sections.push({
      heading: "同世代の力士",
      members: others.slice(0, 3).map((p) => ({
        id: p.id,
        shikona: p.shikona,
        metaLabel: p.peakRankLabel ? `最高位 ${p.peakRankLabel}` : "",
        description: formatGenerationPeerDescription(p),
      })),
    });
  }
  return sections;
};

export const buildEraStarViewModels = (
  summary: CareerWorldSummary,
): EraStarViewModel[] =>
  summary.eraStars.map((s) => ({
    id: s.id,
    shikona: s.shikona,
    peakRankLabel: s.peakRankLabel,
    description: formatDominanceLabel(s),
    yushoNote: formatEraStarYushoNote(s),
  }));

const summarizeRivalForNarrative = (n: NotableNpcSummary | undefined): string | null => {
  if (!n) return null;
  const desc = formatRivalDescription(n);
  return `宿敵${n.shikona}とは${desc}関係になった`;
};

const summarizePeerLeaderForNarrative = (
  n: NotableNpcSummary | undefined,
): string | null => {
  if (!n) return null;
  const peak = n.peakRankLabel;
  if (!peak) return null;
  if (/^(横綱|大関)/.test(peak)) {
    return `同期には${peak}まで駆け上がった力士もおり、厳しい世代を戦った`;
  }
  if (/^(関脇|小結)/.test(peak)) {
    return `同期には三役へ進んだ${n.shikona}がおり、刺激ある世代だった`;
  }
  if (peak.startsWith("前頭") || peak.startsWith("十両")) {
    return `同期には関取まで進んだ${n.shikona}がいた`;
  }
  return null;
};

export const buildCareerWorldNarrative = (
  summary: CareerWorldSummary,
  rarity: CareerRaritySummary,
): string => {
  const sentences: string[] = [];
  const bucket = rarity.highestRankBucket;
  const rankLabel = rarity.highestRankLabel;

  // Sentence 1: career arc
  switch (bucket) {
    case "横綱":
      sentences.push(`${rankLabel}まで上り詰めた、歴史に残る級のキャリア。`);
      break;
    case "大関":
      sentences.push(`${rankLabel}まで到達し、頂点を狙った大関のキャリア。`);
      break;
    case "三役":
      sentences.push(`${rankLabel}まで番付を上げ、三役の壁を越えたキャリア。`);
      break;
    case "幕内":
      sentences.push(`${rankLabel}まで到達した、幕内常連クラスのキャリア。`);
      break;
    case "十両":
      sentences.push(`${rankLabel}まで到達した、希少な関取キャリア。`);
      break;
    case "幕下":
      sentences.push(`${rankLabel}まで上がったが、関取の壁には届かなかった。`);
      break;
    case "三段目":
      sentences.push(`${rankLabel}まで番付を上げたが、幕下の壁には届かなかった。`);
      break;
    case "序二段":
      sentences.push(`序二段で多くの場所を戦った、下位番付のキャリア。`);
      break;
    case "序ノ口":
      sentences.push(`短いキャリアで土俵を去った力士。`);
      break;
    default:
      sentences.push(`土俵に上がり、その世界に足跡を残した力士。`);
  }

  // Sentence 2: relationships
  const peerLine = summarizePeerLeaderForNarrative(summary.generationPeers[0]);
  const rivalLine = summarizeRivalForNarrative(summary.rivals[0]);
  if (peerLine) {
    sentences.push(`${peerLine}。`);
  } else if (rivalLine) {
    sentences.push(`${rivalLine}。`);
  } else if (summary.eraStars.length > 0) {
    const top = summary.eraStars[0];
    sentences.push(`この時代には${top.shikona}(${top.peakRankLabel})が君臨していた。`);
  } else {
    // empty — fallback by bucket
    if (bucket === "三段目" || bucket === "序二段" || bucket === "序ノ口") {
      sentences.push("同期や宿敵との対戦が、このキャリアの中心となった。");
    } else {
      sentences.push("土俵を共にした力士たちと、この一代を歩んだ。");
    }
  }

  return sentences.join("");
};
