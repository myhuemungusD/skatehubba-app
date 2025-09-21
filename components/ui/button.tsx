'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '../../src/utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-full border border-transparent px-5 py-3 text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-hubba-green text-black hover:bg-hubba-green/90 focus-visible:outline-hubba-green',
        outline:
          'border-white/30 bg-transparent text-white hover:border-white hover:bg-white/10 focus-visible:outline-white',
        ghost: 'bg-transparent text-white hover:bg-white/5 focus-visible:outline-hubba-orange'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';
