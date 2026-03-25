import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center ui-text-button rounded-none border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.99]",
          {
            'border-brand-line/45 bg-brand-line/12 text-text hover:bg-brand-line/18 hover:border-brand-line/70 focus-visible:ring-brand-line/25': variant === 'primary',
            'border-brand-muted/65 bg-surface-panel/72 text-text hover:border-brand-line/35 hover:bg-surface-raised/85 focus-visible:ring-brand-line/20': variant === 'secondary',
            'border-brand-muted/60 bg-transparent text-text-dim hover:border-brand-line/35 hover:text-text hover:bg-surface-panel/40 focus-visible:ring-brand-line/20': variant === 'outline',
            'border-transparent bg-transparent text-text-dim hover:text-text hover:bg-surface-panel/42 focus-visible:ring-brand-line/15': variant === 'ghost',
            'border-warning/45 bg-warning/10 text-warning-bright hover:bg-warning/14 focus-visible:ring-warning/28': variant === 'danger',
            'border-state/45 bg-state/10 text-state-bright hover:bg-state/14 focus-visible:ring-state/28': variant === 'success',
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
