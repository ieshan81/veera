import { Slot } from '@radix-ui/react-slot'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    asChild?: boolean
  }
>(function Button({ className, variant = 'primary', disabled, asChild, ...props }, ref) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      disabled={asChild ? undefined : disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-veera-accent disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' &&
        'bg-veera-accent text-white shadow-sm hover:brightness-95',
        variant === 'secondary' &&
        'border border-veera-border bg-veera-surface text-veera-fg hover:bg-veera-accent-soft',
        variant === 'ghost' &&
        'text-veera-muted hover:bg-veera-accent-soft hover:text-veera-fg',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
      {...props}
    />
  )
})
