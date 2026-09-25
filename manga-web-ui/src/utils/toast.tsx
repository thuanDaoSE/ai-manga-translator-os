import React from 'react';
import toast, { type Toast } from 'react-hot-toast';
import {
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Lock,
  X,
  type LucideIcon,
} from 'lucide-react';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error' | 'download';

export interface NotifyOptions {
  title: string;
  description?: string;
  icon?: LucideIcon;
  variant?: ToastVariant;
  duration?: number;
}

const variantStyles: Record<
  ToastVariant,
  {
    iconBg: string;
    iconColor: string;
    borderColor: string;
    defaultIcon: LucideIcon;
  }
> = {
  info: {
    iconBg: 'bg-indigo-500/15',
    iconColor: 'text-indigo-400',
    borderColor: 'border-indigo-500/30',
    defaultIcon: Info,
  },
  download: {
    iconBg: 'bg-indigo-500/15',
    iconColor: 'text-indigo-400',
    borderColor: 'border-indigo-500/30',
    defaultIcon: Download,
  },
  success: {
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    defaultIcon: CheckCircle2,
  },
  warning: {
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-400',
    borderColor: 'border-amber-500/30',
    defaultIcon: AlertTriangle,
  },
  error: {
    iconBg: 'bg-rose-500/15',
    iconColor: 'text-rose-400',
    borderColor: 'border-rose-500/30',
    defaultIcon: AlertCircle,
  },
};

/**
 * Hiển thị thông báo (toast) hiện đại, đồng bộ phong cách dark glassmorphism
 * Không dùng icon emoji AI đơn sơ.
 */
export const notify = {
  custom: ({
    title,
    description,
    icon,
    variant = 'info',
    duration = 4500,
  }: NotifyOptions) => {
    const config = variantStyles[variant] || variantStyles.info;
    const IconComponent = icon || config.defaultIcon;

    return toast.custom(
      (t: Toast) => (
        <div
          className={`relative flex items-start gap-3 w-full max-w-md p-3.5 rounded-xl bg-slate-900/95 border ${config.borderColor} shadow-2xl backdrop-blur-xl ring-1 ring-white/10 transition-all duration-300 pointer-events-auto text-left ${
            t.visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95'
          }`}
        >
          {/* Icon Badge */}
          <div
            className={`p-2 rounded-lg shrink-0 flex items-center justify-center ${config.iconBg} border ${config.borderColor}`}
          >
            <IconComponent size={18} className={config.iconColor} />
          </div>

          {/* Text Content */}
          <div className="flex-1 min-w-0 pt-0.5">
            <h4 className="text-xs font-semibold text-slate-100 leading-snug tracking-wide">
              {title}
            </h4>
            {description && (
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>

          {/* Close Button */}
          <button
            onClick={() => toast.dismiss(t.id)}
            className="text-slate-500 hover:text-slate-200 p-1 rounded-md hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Đóng thông báo"
          >
            <X size={13} />
          </button>
        </div>
      ),
      { duration }
    );
  },

  download: (title: string, description?: string, options?: { duration?: number; icon?: LucideIcon }) => {
    return notify.custom({
      title,
      description,
      variant: 'download',
      icon: options?.icon,
      duration: options?.duration ?? 5000,
    });
  },

  success: (title: string, description?: string, options?: { duration?: number; icon?: LucideIcon }) => {
    return notify.custom({
      title,
      description,
      variant: 'success',
      icon: options?.icon,
      duration: options?.duration ?? 4000,
    });
  },

  info: (title: string, description?: string, options?: { duration?: number; icon?: LucideIcon }) => {
    return notify.custom({
      title,
      description,
      variant: 'info',
      icon: options?.icon,
      duration: options?.duration ?? 4000,
    });
  },

  warning: (title: string, description?: string, options?: { duration?: number; icon?: LucideIcon }) => {
    return notify.custom({
      title,
      description,
      variant: 'warning',
      icon: options?.icon,
      duration: options?.duration ?? 4500,
    });
  },

  error: (title: string, description?: string, options?: { duration?: number; icon?: LucideIcon }) => {
    return notify.custom({
      title,
      description,
      variant: 'error',
      icon: options?.icon,
      duration: options?.duration ?? 5000,
    });
  },
};
