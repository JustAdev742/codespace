import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'sticker bg-lantern text-on-accent',
  success: 'sticker bg-glim text-on-accent',
  danger: 'sticker bg-ember text-on-accent',
  secondary: 'press-soft bg-raised text-text hover:bg-surface-2 active:bg-surface-3',
  ghost: 'text-text-2 hover:bg-surface-2 hover:text-text active:bg-surface-3',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-[8px]',
  md: 'h-10 px-4 text-[15px] gap-2 rounded-[10px]',
  lg: 'h-12 px-5 text-base gap-2 rounded-[10px]',
  /** Condensed display type runs small, so the big sizes take a larger step. */
  xl: 'h-14 px-7 text-[1.35rem] gap-2.5 rounded-[12px] font-display font-bold',
  /** Stage calls to action: join, start, play again. */
  '2xl': 'h-16 px-8 text-[1.85rem] gap-3 rounded-[14px] font-display font-extrabold [--press:6px]',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra = '') {
  return `inline-flex shrink-0 select-none items-center justify-center font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', loading = false, icon, className = '', children, disabled, type = 'button', onClick, ...rest }, ref) {
  // While loading the button ignores presses but stays focusable: disabling it
  // would drop keyboard focus to the page in the middle of an action.
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, `${loading ? 'cursor-progress' : ''} ${className}`)}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {loading ? <Loader2 className="size-[1.1em] animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ variant = 'secondary', size = 'md', icon, className = '', children, ...rest }: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' | 'lg'; variant?: 'ghost' | 'secondary' }>(function IconButton(
  { label, size = 'md', variant = 'ghost', className = '', children, type = 'button', ...rest },
  ref,
) {
  const s = size === 'sm' ? 'size-8' : size === 'lg' ? 'size-12' : 'size-10';
  return (
    <button ref={ref} type={type} aria-label={label} title={label} className={`inline-grid shrink-0 place-items-center rounded-[10px] transition-colors disabled:opacity-50 ${s} ${VARIANTS[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
});
