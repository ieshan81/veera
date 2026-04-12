import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full rounded-lg border border-veera-border bg-veera-surface px-3 py-2 text-sm text-veera-fg shadow-sm placeholder:text-veera-muted focus:border-veera-accent focus:outline-none focus:ring-1 focus:ring-veera-accent',
          className,
        )}
        {...props}
      />
    )
  },
)
