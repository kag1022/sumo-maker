import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-none border-[1.5px] font-bold transition-none focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          {
            'border-sumi bg-sumi text-washi hover:bg-shuiro hover:border-shuiro': variant === 'primary',
            'border-sumi bg-transparent text-sumi hover:bg-sumi hover:text-washi': variant === 'secondary',
            'border-sumi border-dashed bg-transparent text-sumi hover:border-solid hover:bg-washi-dark': variant === 'outline',
            'border-transparent hover:border-sumi hover:bg-washi-dark': variant === 'ghost',
            'h-9 px-3 text-sm': size === 'sm',
            'h-10 px-4 py-2': size === 'md',
            'h-12 px-8 text-lg': size === 'lg',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
