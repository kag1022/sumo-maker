import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BodyType } from '../../logic/models';

const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const BODY_LABELS: Record<BodyType, string> = {
  NORMAL: '均整',
  SOPPU: '細身',
  ANKO: '重量',
  MUSCULAR: '筋力',
};

interface RikishiPortraitProps {
  bodyType: BodyType;
  facing?: 'front' | 'back';
  className?: string;
  innerClassName?: string;
  showLabel?: boolean;
  presentation?: 'framed' | 'blend';
}

const getImagePath = (bodyType: BodyType, facing: 'front' | 'back') => {
  const prefix = bodyType.toLowerCase();
  return `/images/rikishi/${prefix}_${facing}.png`;
};

export const RikishiPortrait: React.FC<RikishiPortraitProps> = ({
  bodyType,
  facing = 'front',
  className,
  innerClassName,
  showLabel = false,
  presentation = 'framed',
}) => (
  <div className={cn('relative overflow-hidden', className)}>
    <div
      className={cn(
        presentation === 'blend'
          ? 'relative flex h-full items-end justify-center bg-transparent p-0'
          : 'relative flex h-full items-end justify-center border-2 border-[rgba(214,162,61,0.16)] bg-[linear-gradient(180deg,rgba(23,28,32,0.96),rgba(11,13,16,1))] p-3 shadow-[inset_0_0_0_2px_rgba(91,122,165,0.08)]',
        innerClassName,
      )}
    >
      {presentation === 'blend' ? null : <div className="absolute inset-0 arcade-grid opacity-20" />}
      {presentation === 'blend' ? null : (
        <div className="absolute inset-x-3 bottom-0 h-5 border-t-2 border-[rgba(214,162,61,0.18)] bg-[rgba(91,122,165,0.28)]" />
      )}
      <img
        src={getImagePath(bodyType, facing)}
        alt={`${BODY_LABELS[bodyType]}体型の力士`}
        className={cn(
          'pixelated relative z-10 h-full w-auto object-contain',
          presentation === 'blend'
            ? 'max-h-[260px] drop-shadow-[0_16px_24px_rgba(0,0,0,0.48)]'
            : 'max-h-[190px] drop-shadow-[0_10px_14px_rgba(0,0,0,0.35)]',
        )}
      />
      {showLabel && (
        <div className="absolute left-3 top-3 museum-chip bg-[rgba(15,18,22,0.88)] text-[0.7rem] text-text">
          {BODY_LABELS[bodyType]}
        </div>
      )}
    </div>
  </div>
);
