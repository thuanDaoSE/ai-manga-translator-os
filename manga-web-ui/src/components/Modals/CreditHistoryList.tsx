import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Gem, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { mangaApi } from '../../services/api';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

interface CreditLog {
  id: string;
  amount: number;
  action_type: string;
  description: string;
  created_at: string | null;
  is_active?: boolean;
  duration?: number;
  apis_called?: string;
}

export default function CreditHistoryList() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<CreditLog[]>([]);
  const [error, setError] = useState('');

  const fetchCreditHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await mangaApi.getCreditHistory();
      setLogs(data.credit_logs || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Không thể tải lịch sử biến động số dư');
      toast.error('Lỗi khi tải lịch sử số dư thời gian');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditHistory();
  }, []);

  const formatDate = (isoStr: string | null) => {
    if (!isoStr) return '-';
    try {
      const date = new Date(isoStr);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${hours}:${minutes} - ${day}/${month}/${year}`;
    } catch (e) {
      return isoStr;
    }
  };

  const getActionTypeLabel = (type: string) => {
    switch (type) {
      case 'GPU_SESSION':
        return { label: 'Phiên GPU ⚡', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      case 'TRANSLATE_LAMA':
        return { label: 'Dịch LAMA', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
      case 'VÀ_NỀN_RUNPOD':
        return { label: 'Vẽ nền AI', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' };
      case 'REGISTER_BONUS':
        return { label: 'Quà tặng', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      case 'REFUND':
        return { label: 'Hoàn giây', color: 'bg-pink-500/10 text-pink-400 border-pink-500/20' };
      case 'DEPOSIT':
        return { label: 'Nạp giây', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      default:
        return { label: type, color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
    }
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="animate-spin text-primary" size={32} />
        <span className="text-sm font-bold text-text-muted">Đang tải lịch sử số dư...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <AlertCircle className="text-danger" size={36} />
        <span className="text-sm font-bold text-danger">{error}</span>
        <button
          onClick={fetchCreditHistory}
          className="px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-bold hover:bg-primary hover:text-white transition-all cursor-pointer mt-2"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="p-4 rounded-full bg-border/20 text-text-muted/40 mb-2">
          <Gem size={44} />
        </div>
        <span className="text-sm font-bold text-text-muted">Chưa có biến động số dư</span>
        <span className="text-xs text-text-muted/60">Lịch sử sử dụng hoặc nạp thời gian của bạn sẽ hiển thị tại đây</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-x-auto">
      <table className="w-full text-left text-xs font-medium border-collapse">
        <thead>
          <tr className="border-b border-border text-text-muted uppercase tracking-wider text-[10px] font-black">
            <th className="py-3 px-2">Hoạt động</th>
            <th className="py-3 px-2">Chi tiết phiên & Tác vụ AI</th>
            <th className="py-3 px-2 text-right">Biến động</th>
            <th className="py-3 px-2 text-right">Thời gian</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const isPositive = log.amount > 0;
            const badge = getActionTypeLabel(log.action_type);
            
            let apis: Array<{ action: string; credits: number; timestamp: string }> = [];
            if (log.action_type === 'GPU_SESSION' && log.apis_called) {
              try {
                apis = JSON.parse(log.apis_called);
              } catch (e) {
                apis = [];
              }
            }
            
            return (
              <tr
                key={log.id}
                className="border-b border-border/50 hover:bg-panel/40 transition-colors"
              >
                <td className="py-3 px-2 vertical-top pt-4">
                  <span className={`inline-block px-2 py-0.5 rounded-[6px] font-bold text-[9px] uppercase tracking-wider border ${badge.color}`}>
                    {badge.label}
                  </span>
                </td>
                <td className="py-3 px-2 font-bold text-text-main max-w-[340px]">
                  {log.action_type === 'GPU_SESSION' ? (
                    <div className="flex flex-col gap-1.5 py-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text-main">
                          {log.is_active ? (
                            <span className="text-emerald-400 flex items-center gap-1.5">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                              </span>
                              Phiên GPU Đang hoạt động...
                            </span>
                          ) : (
                            `Phiên GPU (${log.duration} giây)`
                          )}
                        </span>
                      </div>
                      
                      {apis.length > 0 ? (
                        <div className="flex flex-col gap-1 pl-2 border-l border-white/5 mt-1">
                          <span className="text-[10px] text-text-muted font-semibold">Tác vụ AI đã gọi trong phiên:</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {apis.map((api, idx) => (
                              <span 
                                key={idx} 
                                className="inline-flex items-center gap-1 bg-white/5 border border-white/5 text-[9px] font-bold text-text-muted px-1.5 py-0.5 rounded"
                                title={`Gọi lúc: ${formatDate(api.timestamp)}`}
                              >
                                <span>{api.action}</span>
                                <span className="text-amber-500/80">({api.credits.toFixed(1)}s)</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-text-muted italic pl-2 border-l border-white/5">Chưa có tác vụ AI nào chạy</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-text-main block truncate max-w-[240px]" title={log.description}>
                      {log.description}
                    </span>
                  )}
                </td>
                <td className="py-3 px-2 text-right vertical-top pt-4">
                  <span className={`inline-flex items-center gap-0.5 font-black text-sm ${
                    isPositive ? 'text-green-500' : 'text-red-400'
                  }`}>
                    {isPositive ? (
                      <ArrowUpRight size={14} className="text-green-500" />
                    ) : (
                      <ArrowDownRight size={14} className="text-red-400" />
                    )}
                    {isPositive ? `+${log.amount.toFixed(1)}` : log.amount.toFixed(1)} giây
                  </span>
                </td>
                <td className="py-3 px-2 text-text-muted text-right vertical-top pt-4">
                  {formatDate(log.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
