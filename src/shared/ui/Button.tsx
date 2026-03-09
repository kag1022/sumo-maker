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
          "inline-flex items-center justify-center ui-text-button rounded-none border-[2px] transition-[transform,box-shadow,background-color,color,border-color] duration-150 ease-out focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
          {
            'border-[rgba(255,224,176,0.2)] bg-[linear-gradient(180deg,rgba(206,107,76,0.98),rgba(162,71,48,1))] text-[#fff6ea] shadow-[0_6px_0_rgba(67,26,14,0.5)] hover:-translate-y-[2px] hover:bg-[linear-gradient(180deg,rgba(221,122,87,0.98),rgba(171,78,54,1))] hover:shadow-[0_8px_0_rgba(67,26,14,0.5)] active:translate-y-[2px] active:shadow-[0_4px_0_rgba(67,26,14,0.5)]': variant === 'primary',
            'border-[rgba(255,224,176,0.16)] bg-[linear-gradient(180deg,rgba(74,100,128,0.98),rgba(54,73,94,1))] text-[#eef4ff] shadow-[0_6px_0_rgba(11,16,20,0.52)] hover:-translate-y-[2px] hover:shadow-[0_8px_0_rgba(11,16,20,0.52)] active:translate-y-[2px] active:shadow-[0_4px_0_rgba(11,16,20,0.52)]': variant === 'secondary',
            'border-[rgba(255,224,176,0.18)] bg-[rgba(27,19,14,0.84)] text-[#dbc6a6] shadow-[0_6px_0_rgba(0,0,0,0.28)] hover:-translate-y-[2px] hover:border-[rgba(212,164,65,0.4)] hover:text-[#fff0d6] hover:shadow-[0_8px_0_rgba(0,0,0,0.28)] active:translate-y-[2px] active:shadow-[0_4px_0_rgba(0,0,0,0.28)]': variant === 'outline',
            'border-transparent bg-transparent text-[#cbb792] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#fff0d6]': variant === 'ghost',
            'border-[rgba(255,224,176,0.2)] bg-[linear-gradient(180deg,rgba(196,90,59,0.98),rgba(143,54,36,1))] text-[#fff6ea] shadow-[0_6px_0_rgba(71,20,11,0.5)] hover:-translate-y-[2px] hover:shadow-[0_8px_0_rgba(71,20,11,0.5)] active:translate-y-[2px] active:shadow-[0_4px_0_rgba(71,20,11,0.5)]': variant === 'danger',
            'min-h-[38px] px-3 text-xs': size === 'sm',
            'min-h-[44px] px-4 py-2 text-sm': size === 'md',
            'min-h-[52px] px-6 text-base': size === 'lg',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
