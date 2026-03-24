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
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' &&
          'bg-emerald-700 text-white shadow-sm hover:bg-emerald-800',
        variant === 'secondary' &&
          'border border-[var(--color-veera-border)] bg-[var(--color-veera-surface)] text-[var(--color-veera-fg)] hover:bg-stone-50',
        variant === 'ghost' && 'text-[var(--color-veera-muted)] hover:bg-stone-100 hover:text-[var(--color-veera-fg)]',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
      {...props}
    />
  )
})
