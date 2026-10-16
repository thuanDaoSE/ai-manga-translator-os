import React from 'react';
import { Gift } from 'lucide-react';
import type { SystemQuota } from '../../../store/useAuthStore';

interface QuotaWidgetProps {
  systemQuota?: SystemQuota;
}

export const QuotaWidget: React.FC<QuotaWidgetProps> = ({ systemQuota }) => {
  const remaining = systemQuota?.remaining_pages ?? 300;
  const total = systemQuota?.total_limit ?? 300;
  const hasQuota = remaining > 0;

  return (
    <div
      className={`mx-3 mb-2 px-3 py-2 rounded-xl flex items-center justify-between shadow-sm border transition-all ${
        hasQuota
          ? 'bg-emerald-500/10 border-emerald-500/25'
          : 'bg-rose-500/10 border-rose-500/25'
      }`}
    >
      <div className="flex items-center gap-2">
        <Gift size={16} className={hasQuota ? 'text-emerald-400 shrink-0' : 'text-rose-400 shrink-0'} />
        <div className="flex flex-col">
          <span className="text-xs font-bold text-text-main leading-tight">
            {hasQuota ? `${remaining}/${total} trang` : '0 trang còn lại'}
          </span>
          <span className="text-[9.5px] text-text-muted leading-tight">
            {hasQuota ? 'Dùng thử miễn phí 100%' : 'Đã hết hạn mức 300 trang'}
          </span>
        </div>
      </div>
      <span
        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
          hasQuota ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
        }`}
      >
        {hasQuota ? 'FREE' : 'EXHAUSTED'}
      </span>
    </div>
  );
};

export default QuotaWidget;
