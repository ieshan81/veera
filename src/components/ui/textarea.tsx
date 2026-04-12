import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'min-h-[100px] w-full rounded-lg border border-veera-border bg-veera-surface px-3 py-2 text-sm text-veera-fg shadow-sm placeholder:text-veera-muted focus:border-veera-accent focus:outline-none focus:ring-1 focus:ring-veera-accent',
          className,
        )}
        {...props}
      />
    )
  },
)
