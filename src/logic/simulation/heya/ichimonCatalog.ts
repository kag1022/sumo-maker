import { IchimonId } from '../../models';

export interface IchimonDefinition {
  id: IchimonId;
  shortName: string;
  displayName: string;
  philosophy: string;
}

export const ICHIMON_CATALOG: IchimonDefinition[] = [
  {
    id: 'TAIJU',
    shortName: '大樹',
    displayName: '大樹一門',
    philosophy: '保守本流・四つ相撲中心',
  },
  {
    id: 'KUROGANE',
    shortName: '黒鉄',
    displayName: '黒鉄一門',
    philosophy: '新興勢力・近代スポーツ科学・筋力重視',
  },
  {
    id: 'RAIMEI',
    shortName: '雷鳴',
    displayName: '雷鳴一門',
    philosophy: '武闘派・猛稽古・突き押し特化',
  },
  {
    id: 'HAKUTSURU',
    shortName: '白鶴',
    displayName: '白鶴一門',
    philosophy: '古豪・小兵と業師・技術の継承',
  },
  {
    id: 'HAYATE',
    shortName: '疾風',
    displayName: '疾風一門',
    philosophy: '最小勢力・独立開拓者・師弟二人三脚',
  },
];

export const ICHIMON_BY_ID: Record<IchimonId, IchimonDefinition> = {
  TAIJU: ICHIMON_CATALOG[0],
  KUROGANE: ICHIMON_CATALOG[1],
  RAIMEI: ICHIMON_CATALOG[2],
  HAKUTSURU: ICHIMON_CATALOG[3],
  HAYATE: ICHIMON_CATALOG[4],
};