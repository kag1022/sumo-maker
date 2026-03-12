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
            'border-[rgba(214,162,61,0.18)] bg-[linear-gradient(180deg,rgba(221,70,55,0.98),rgba(150,29,22,1))] text-[#fff8ef] shadow-[0_6px_0_rgba(50,8,8,0.5)] hover:-translate-y-[2px] hover:bg-[linear-gradient(180deg,rgba(235,84,70,0.98),rgba(166,34,26,1))] hover:shadow-[0_8px_0_rgba(50,8,8,0.5)] active:translate-y-[2px] active:shadow-[0_4px_0_rgba(50,8,8,0.5)]': variant === 'primary',
            'border-[rgba(91,122,165,0.28)] bg-[linear-gradient(180deg,rgba(55,79,113,0.98),rgba(30,44,69,1))] text-[#eef2fb] shadow-[0_6px_0_rgba(6,11,17,0.52)] hover:-translate-y-[2px] hover:shadow-[0_8px_0_rgba(6,11,17,0.52)] active:translate-y-[2px] active:shadow-[0_4px_0_rgba(6,11,17,0.52)]': variant === 'secondary',
            'border-[rgba(214,162,61,0.18)] bg-[rgba(19,22,29,0.92)] text-[#d6a23d] shadow-[0_6px_0_rgba(0,0,0,0.28)] hover:-translate-y-[2px] hover:border-[rgba(214,162,61,0.42)] hover:text-[#f3e9d2] hover:shadow-[0_8px_0_rgba(0,0,0,0.28)] active:translate-y-[2px] active:shadow-[0_4px_0_rgba(0,0,0,0.28)]': variant === 'outline',
            'border-transparent bg-transparent text-[#9da7b3] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#f3e9d2]': variant === 'ghost',
            'border-[rgba(240,109,98,0.26)] bg-[linear-gradient(180deg,rgba(199,58,44,0.98),rgba(129,22,17,1))] text-[#fff8ef] shadow-[0_6px_0_rgba(55,10,9,0.5)] hover:-translate-y-[2px] hover:shadow-[0_8px_0_rgba(55,10,9,0.5)] active:translate-y-[2px] active:shadow-[0_4px_0_rgba(55,10,9,0.5)]': variant === 'danger',
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
