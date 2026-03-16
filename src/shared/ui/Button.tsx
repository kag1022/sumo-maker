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
          "inline-flex items-center justify-center ui-text-button rounded-none border-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.985]",
          {
            'border-action bg-action/14 text-action-bright hover:bg-action/20 focus-visible:ring-action/35': variant === 'primary',
            'border-brand-muted bg-surface-panel text-text hover:border-brand-line/60 hover:bg-surface-raised focus-visible:ring-brand-line/25': variant === 'secondary',
            'border-brand-muted/70 bg-transparent text-text-dim hover:border-action/40 hover:text-text hover:bg-action/6 focus-visible:ring-action/25': variant === 'outline',
            'border-transparent bg-transparent text-text-dim hover:text-text hover:bg-surface-raised focus-visible:ring-brand-line/20': variant === 'ghost',
            'border-warning bg-warning/10 text-warning-bright hover:bg-warning/16 focus-visible:ring-warning/35': variant === 'danger',
            'border-state bg-state/12 text-state-bright hover:bg-state/18 focus-visible:ring-state/35': variant === 'success',
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
