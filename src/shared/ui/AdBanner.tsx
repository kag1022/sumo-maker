import React from 'react';

interface AdBannerProps {
  placement: 'buildlab' | 'hall' | 'report';
}

const placementLabel: Record<AdBannerProps['placement'], string> = {
  buildlab: 'ビルドラボ枠',
  hall: '殿堂枠',
  report: '結果画面枠',
};

export const AdBanner: React.FC<AdBannerProps> = ({ placement }) => (
  <div className="border-2 border-gold-muted bg-bg-panel px-3 py-2 text-xs text-text-dim">
    <span className="ui-text-label text-gold mr-2">広告</span>
    <span>{placementLabel[placement]}</span>
  </div>
);
