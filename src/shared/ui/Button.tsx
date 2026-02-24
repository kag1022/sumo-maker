import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // ベーススタイル: RPGメニュー風
          "inline-flex items-center justify-center font-pixel rounded-none transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/50 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]",
          {
            // プライマリ: 金色二重枠
            'border-2 border-gold bg-bg-panel text-gold-bright hover:bg-bg-hover hover:shadow-rpg-glow': variant === 'primary',
            // セカンダリ
            'border-2 border-gold-muted bg-bg-panel text-text hover:border-gold/60 hover:bg-bg-hover': variant === 'secondary',
            // アウトライン
            'border-2 border-dashed border-gold-muted bg-transparent text-text-dim hover:border-gold/50 hover:text-text': variant === 'outline',
            // ゴースト
            'border-2 border-transparent text-text-dim hover:text-text hover:bg-bg-hover': variant === 'ghost',
            // デンジャー: 朱色
            'border-2 border-crimson bg-bg-panel text-crimson-bright hover:bg-crimson-dim/20 hover:shadow-rpg-red': variant === 'danger',
            // サイズ: モバイルタップ対応 (最小44px)
            'min-h-[36px] sm:min-h-[32px] px-3 text-xs': size === 'sm',
            'min-h-[44px] px-4 py-2 text-sm': size === 'md',
            'min-h-[48px] px-6 text-base': size === 'lg',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
