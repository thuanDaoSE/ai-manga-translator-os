import { useState, useEffect } from 'react';
import { X, CreditCard, Loader2, RefreshCw, Gem, AlertCircle } from 'lucide-react';
import { mangaApi } from '../../services/api';
import toast from 'react-hot-toast';

interface Transaction {
  order_code: number;
  package_name: string;
  amount: number;
  credits_added: number;
  status: string;
  checkout_url?: string;
  created_at: string | null;
}

interface PaymentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PaymentHistoryModal({ isOpen, onClose }: PaymentHistoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState('');

  const fetchHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await mangaApi.getPaymentHistory();
      setTransactions(data.transactions || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Lỗi khi tải lịch sử giao dịch!');
      toast.error('Không thể lấy lịch sử giao dịch.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  const formatDate = (isoStr: string | null) => {
    if (!isoStr) return '-';
    try {
      const date = new Date(isoStr);
      return date.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return isoStr;
    }
  };

  return (
    <div
      className="fixed inset-0 bg-background/90 backdrop-blur-md flex items-center justify-center z-[9999] animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-panel p-6 rounded-3xl border border-border shadow-2xl w-[700px] max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-300 relative text-text-main">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-text-muted hover:text-text-main transition-colors cursor-pointer"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5 border-b border-border pb-4 pr-10">
          <div className="p-2.5 bg-primary/20 rounded-xl text-primary shadow-inner">
            <CreditCard size={22} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-black tracking-tight uppercase">Lịch sử giao dịch</h2>
            <p className="text-[11px] text-text-muted mt-0.5">Danh sách các đơn nạp tiền của bạn</p>
          </div>
          {/* Refresh Button */}
          <button
            onClick={fetchHistory}
            disabled={loading}
            className="p-2 text-text-muted hover:text-text-main hover:bg-border/40 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="Làm mới lịch sử"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[300px] flex flex-col justify-center">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="animate-spin text-primary" size={32} />
              <span className="text-sm font-bold text-text-muted">Đang tải lịch sử giao dịch...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 px-6 text-center">
              <AlertCircle className="text-danger" size={36} />
              <span className="text-sm font-bold text-danger">{error}</span>
              <button
                onClick={fetchHistory}
                className="px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-bold hover:bg-primary hover:text-white transition-all cursor-pointer mt-2"
              >
                Thử lại
              </button>
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="p-4 rounded-full bg-border/20 text-text-muted/40 mb-2">
                <CreditCard size={44} />
              </div>
              <span className="text-sm font-bold text-text-muted">Chưa có giao dịch nào</span>
              <span className="text-xs text-text-muted/60">Bạn chưa thực hiện bất kỳ giao dịch nạp tiền nào.</span>
            </div>
          ) : (
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left text-xs font-medium border-collapse">
                <thead>
                  <tr className="border-b border-border text-text-muted uppercase tracking-wider text-[10px] font-black">
                    <th className="py-3 px-2">Mã GD</th>
                    <th className="py-3 px-2">Gói nạp</th>
                    <th className="py-3 px-2 text-right">Số tiền</th>
                    <th className="py-3 px-2 text-right">Credits</th>
                    <th className="py-3 px-2 text-center">Trạng thái</th>
                    <th className="py-3 px-2 text-right">Ngày nạp</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => {
                    const isPaid = txn.status === 'PAID';
                    const isPending = txn.status === 'PENDING';
                    
                    return (
                      <tr
                        key={txn.order_code}
                        className="border-b border-border/50 hover:bg-panel/40 transition-colors"
                      >
                        <td className="py-3 px-2 font-mono text-[11px] font-bold text-text-muted">
                          {txn.order_code}
                        </td>
                        <td className="py-3 px-2 font-bold text-text-main">
                          {txn.package_name}
                        </td>
                        <td className="py-3 px-2 font-bold text-text-main text-right">
                          {formatCurrency(txn.amount)}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <span className="inline-flex items-center gap-1 font-black text-primary">
                            <Gem size={12} className="text-primary" />
                            {txn.credits_added > 0 ? `+${txn.credits_added}` : 'PRO'}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-[6px] font-bold text-[9px] uppercase tracking-wider ${
                                isPaid
                                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                  : isPending
                                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                  : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                              }`}
                            >
                              {isPaid ? 'Thành công' : isPending ? 'Chờ thanh toán' : 'Đã hủy'}
                            </span>
                            {isPending && txn.checkout_url && (
                              <a
                                href={txn.checkout_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-primary hover:underline font-bold mt-0.5 block transition-colors"
                              >
                                Thanh toán tiếp ➔
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-text-muted text-right">
                          {formatDate(txn.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
