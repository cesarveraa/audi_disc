import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type AppButtonVariant = 'primary' | 'neutral' | 'ghost';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  isLoading?: boolean;
  icon?: ReactNode;
};

const variantClass: Record<AppButtonVariant, string> = {
  primary:
    'bg-audi-red text-white shadow-button hover:bg-audi-redDark focus-visible:ring-audi-red',
  neutral:
    'border border-gray-200 bg-white text-gray-900 shadow-sm hover:border-gray-300 hover:bg-gray-50 focus-visible:ring-gray-400',
  ghost:
    'bg-white/60 text-gray-700 hover:bg-white focus-visible:ring-gray-400',
};

export function AppButton({
  variant = 'neutral',
  isLoading = false,
  icon,
  children,
  disabled,
  className = '',
  ...props
}: Props) {
  return (
    <button
      className={[
        'inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold',
        'transition duration-200 ease-out active:scale-[0.98]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variantClass[variant],
        className,
      ].join(' ')}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      <span>{children}</span>
    </button>
  );
}

