'use client';

import { forwardRef } from 'react';
import { cn } from '../../src/utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-base text-white shadow-inner transition focus:border-hubba-green focus:outline-none focus:ring-2 focus:ring-hubba-green/70',
        className
      )}
      {...props}
    />
  );
});
Input.displayName = 'Input';
