import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'sticker bg-lantern text-on-accent',
  success: 'sticker bg-glim text-on-accent',
  danger: 'sticker bg-ember text-on-accent',
  secondary: 'border border-line-strong bg-raised text-text hover:bg-surface-2 active:bg-surface-3',
  ghost: 'text-text-2 hover:bg-surface-2 hover:text-text active:bg-surface-3',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-[10px]',
  md: 'h-10 px-4 text-[15px] gap-2 rounded-[12px]',
  lg: 'h-12 px-5 text-base gap-2 rounded-[14px]',
  xl: 'h-14 px-7 text-lg gap-2.5 rounded-[16px] font-display tracking-wide',
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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', loading = false, icon, className = '', children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
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
    <button ref={ref} type={type} aria-label={label} title={label} className={`inline-grid shrink-0 place-items-center rounded-[12px] transition-colors disabled:opacity-50 ${s} ${VARIANTS[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
});
