export const KIMARITE_ALIAS_MAP: Record<string, string> = {
  'すくい投げ': '掬い投げ',
  '肩すかし': '肩透かし',
  '頭捻り': 'ずぶねり',
  '逆取ったり': '逆とったり',
  '打っ棄り': 'うっちゃり',
  '外たすきぞり': '外たすき反り',
  'たすきぞり': 'たすき反り',
  '後ろ凭れ': '後ろもたれ',
  'はたき込み': '叩き込み',
  'つり出し': '吊り出し',
  'つり落とし': '吊り落とし',
  'うわて投げ': '上手投げ',
  'したて投げ': '下手投げ',
  '不戦勝': '不戦',
  '不戦敗': '不戦',
};

export const normalizeKimariteName = (name: string): string =>
  KIMARITE_ALIAS_MAP[name.normalize('NFC')] || name.normalize('NFC');
