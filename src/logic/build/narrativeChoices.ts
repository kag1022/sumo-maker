import {
  BuildAxisClutch,
  BuildAxisDurability,
  BuildAxisPeakDesign,
  BuildAxisVolatility,
  BuildAxisWinStyle,
  BuildSpecV4,
  Trait,
} from '../models';

export interface PoeticChoice<T extends string> {
  value: T;
  label: string;
  blurb: string;
}

export const BODY_TYPE_CHOICES: PoeticChoice<BuildSpecV4['bodyType']>[] = [
  { value: 'NORMAL', label: '崩れず、土俵に残る体', blurb: '重さも速さも捨てず、受け止める強さを信じる。' },
  { value: 'SOPPU', label: '細さの奥に刃を隠す体', blurb: '軽さと間合いで、土俵の呼吸をずらしていく。' },
  { value: 'ANKO', label: '土俵に影を落とす体', blurb: '質量そのものが流れを変える。前に出たときの説得力がある。' },
  { value: 'MUSCULAR', label: '瞬間で押し切る体', blurb: '一気に形勢を決める圧を宿すが、荒さも抱え込む。' },
];

export const HISTORY_CHOICES: PoeticChoice<BuildSpecV4['history']>[] = [
  { value: 'JHS_GRAD', label: '若いうちに部屋の空気へ沈む', blurb: '角界しか知らない時間が長く、そのぶん癖も深くなる。' },
  { value: 'HS_GRAD', label: '基礎を積んでから角界へ入る', blurb: '完成しきってはいないが、土台は崩れにくい。' },
  { value: 'HS_YOKOZUNA', label: '早くから名を知られている', blurb: '期待は先に届く。重圧もまた、先に届く。' },
  { value: 'UNI_YOKOZUNA', label: '遠回りしてから土俵へ帰る', blurb: '遅れて入るぶん、最初から高い場所が見えている。' },
];

export const ENTRY_DIVISION_CHOICES: PoeticChoice<BuildSpecV4['entryDivision']>[] = [
  { value: 'Maezumo', label: '砂を踏むところから始める', blurb: '誰にも見られない日々を長く過ごす。' },
  { value: 'Sandanme90', label: '少し先の列から名を呼ばれる', blurb: '初めから下積みの一部を飛び越えている。' },
  { value: 'Makushita60', label: '最初から関取の影が近い', blurb: '高い場所へ出るまでの距離は短いが、密度は濃い。' },
];

export const WIN_STYLE_CHOICES: PoeticChoice<BuildAxisWinStyle>[] = [
  { value: 'STABILITY', label: '崩れない相撲を選ぶ', blurb: '派手さより、負けにくさを残す。' },
  { value: 'BURST', label: '場所ごとに火を噴く', blurb: '当たるときは強いが、静かな場所もある。' },
  { value: 'COMEBACK', label: '追い込まれてから粘る', blurb: '勝負の後半で顔つきが変わる。' },
];

export const PEAK_CHOICES: PoeticChoice<BuildAxisPeakDesign>[] = [
  { value: 'EARLY', label: '若いうちに花開く', blurb: '早く名が出るが、長く保つとは限らない。' },
  { value: 'BALANCED', label: '長く均しながら育つ', blurb: '極端ではないが、崩れにくい軌道を描く。' },
  { value: 'LATE', label: '遅れて太くなる', blurb: '時間をかけて形になるぶん、最後まで伸びしろが残る。' },
];

export const VOLATILITY_CHOICES: PoeticChoice<BuildAxisVolatility>[] = [
  { value: 'LOW', label: '平熱で歩く', blurb: '場所ごとの波は小さく、読みやすい人生になる。' },
  { value: 'MID', label: '波を抱えたまま進む', blurb: '安定と揺らぎが同居する。' },
  { value: 'HIGH', label: '祭りか、沈黙か', blurb: '良い場所と悪い場所の落差が大きい。' },
];

export const DURABILITY_CHOICES: PoeticChoice<BuildAxisDurability>[] = [
  { value: 'IRON', label: '痛みと付き合える', blurb: '多少の無理を飲み込み、土俵に立ち続ける。' },
  { value: 'BALANCED', label: '無理は抱え込まない', blurb: '極端な強さではないが、壊れ方も極端ではない。' },
  { value: 'GAMBLE', label: '壊れる前提で前へ出る', blurb: '爆発力を優先し、その代わり代償も背負う。' },
];

export const CLUTCH_CHOICES: PoeticChoice<BuildAxisClutch>[] = [
  { value: 'BIG_MATCH', label: '人の目が多いほど燃える', blurb: '節目や重圧が、むしろ輪郭を濃くする。' },
  { value: 'BALANCED', label: '土俵はいつも同じだと考える', blurb: '相手や場に引きずられず、自分のままで立つ。' },
  { value: 'DEVELOPMENT', label: '勝負より、明日の伸びを取る', blurb: '目先より積み重ねを選ぶ。' },
];

export const TRAIT_SLOT_CHOICES: Array<{ value: number; label: string; blurb: string }> = [
  { value: 0, label: '何も持たずに入る', blurb: '素のまま土俵へ向かう。' },
  { value: 1, label: 'ひとつだけ癖を持つ', blurb: '人生を決める要素を一つ抱える。' },
  { value: 2, label: '二枚の札を忍ばせる', blurb: '明確な持ち味が二つ並ぶ。' },
  { value: 3, label: 'いくつかの顔を持つ', blurb: '相撲の輪郭が少し複雑になる。' },
  { value: 4, label: '物語の枝を増やす', blurb: '強みも弱みも、多方面へ伸びる。' },
  { value: 5, label: '生涯そのものを濃くする', blurb: '何が起きても不思議ではない器になる。' },
];

export const APTITUDE_REVEAL_COPY = {
  hidden: '素質は伏せたまま送り出す',
  revealed: '素質の輪郭だけは先に覗く',
  blurb: '知りすぎない方が妄想は豊かだが、少しだけ覗くこともできる。',
};

export const traitFlavorLabel = (trait: Trait): string => {
  switch (trait) {
    case 'KEIKO_NO_MUSHI':
      return '稽古場で削れても残る';
    case 'TETSUJIN':
      return '折れずに積み上がる';
    case 'SOUJUKU':
      return '若くして咲く';
    case 'TAIKI_BANSEI':
      return '遅れて深まる';
    case 'BUJI_KORE_MEIBA':
      return '無事こそが才能';
    case 'GLASS_KNEE':
      return '膝に影を抱える';
    case 'BAKUDAN_MOCHI':
      return '危うさごと力にする';
    case 'SABORI_GUSE':
      return '継続を嫌う';
    case 'OOBUTAI_NO_ONI':
      return '大舞台だけは外さない';
    case 'KYOUSHINZOU':
      return '心拍が揺れない';
    case 'KINBOSHI_HUNTER':
      return '強者を見ると燃える';
    case 'RENSHOU_KAIDOU':
      return '波に乗ると止まらない';
    case 'KIBUNYA':
      return '機嫌で空気が変わる';
    case 'NOMI_NO_SHINZOU':
      return '重圧に潰れやすい';
    case 'SLOW_STARTER':
      return '遅れて温まる';
    case 'KYOJIN_GOROSHI':
      return '大きな相手に刃を向ける';
    case 'KOHEI_KILLER':
      return '軽い相手を逃がさない';
    case 'DOHYOUGIWA_MAJUTSU':
      return '残す術を知っている';
    case 'YOTSU_NO_ONI':
      return '組んでからが本番';
    case 'TSUPPARI_TOKKA':
      return '突き放してこそ生きる';
    case 'ARAWAZASHI':
      return '定石を嫌う';
    case 'LONG_REACH':
      return '遠い間合いで触れる';
    case 'HEAVY_PRESSURE':
      return '重みで息を詰まらせる';
    case 'RECOVERY_MONSTER':
      return '傷から戻るのが早い';
    case 'WEAK_LOWER_BACK':
      return '腰に脆さを抱える';
    case 'OPENING_DASH':
      return '立ち合いで流れを奪う';
    case 'SENSHURAKU_KISHITSU':
      return '千秋楽に顔を変える';
    case 'TRAILING_FIRE':
      return '追うほど熱を帯びる';
    case 'PROTECT_LEAD':
      return '先に立つと崩れない';
    case 'BELT_COUNTER':
      return '差されても返せる';
    case 'THRUST_RUSH':
      return '突きの連打で畳む';
    case 'READ_THE_BOUT':
      return '間合いを先読みする';
    case 'CLUTCH_REVERSAL':
      return '最後の最後で返す';
    default:
      return trait;
  }
};
