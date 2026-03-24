import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'min-h-[100px] w-full rounded-lg border border-[var(--color-veera-border)] bg-[var(--color-veera-surface)] px-3 py-2 text-sm text-[var(--color-veera-fg)] shadow-sm placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600',
          className,
        )}
        {...props}
      />
    )
  },
)
