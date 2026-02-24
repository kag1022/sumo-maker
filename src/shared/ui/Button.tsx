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
          "inline-flex items-center justify-center rounded-none font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-kiniro/50 disabled:pointer-events-none disabled:opacity-40",
          {
            'border border-kiniro/60 bg-gradient-to-b from-kiniro to-kiniro-dark text-washi hover:from-kiniro-light hover:to-kiniro shadow-game': variant === 'primary',
            'border border-kiniro-muted/30 bg-washi-light text-sumi hover:bg-washi-light/80 hover:border-kiniro/40': variant === 'secondary',
            'border border-dashed border-kiniro-muted/30 bg-transparent text-sumi-light hover:border-kiniro/40 hover:text-sumi': variant === 'outline',
            'border border-transparent text-sumi-light hover:text-sumi hover:bg-washi-light/50': variant === 'ghost',
            'border border-shuiro/60 bg-gradient-to-b from-shuiro to-shuiro-dark text-white hover:from-shuiro-light hover:to-shuiro shadow-glow-red': variant === 'danger',
            'h-8 px-3 text-xs': size === 'sm',
            'h-10 px-4 py-2 text-sm': size === 'md',
            'h-12 px-8 text-base': size === 'lg',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
