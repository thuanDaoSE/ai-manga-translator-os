import { ShieldCheck, X } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function PolicyModal({ isOpen, onClose }: Props) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-panel border border-border shadow-2xl rounded-2xl w-[600px] max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-border overflow-hidden shrink-0">
          <div className="absolute inset-0 bg-emerald-500/10 pointer-events-none"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h2 className="text-base font-black text-white tracking-tight">{t('policyModal.title')}</h2>
                <p className="text-xs text-text-muted mt-0.5">{t('policyModal.subtitle')}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-text-muted hover:text-white hover:bg-border rounded-xl transition-all cursor-pointer">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Nội dung Policy (Có thanh cuộn) */}
        <div className="p-6 overflow-y-auto custom-scrollbar text-sm text-text-muted space-y-4">
          
          <h3 className="text-white font-bold uppercase tracking-wider text-xs">{t('policyModal.sec1Title')}</h3>
          <p>
            <Trans i18nKey="policyModal.sec1Desc">
              Hệ thống của chúng tôi (MangaAI Studio) chỉ lưu trữ tạm thời các tệp tin ảnh và bản dịch của bạn trên máy chủ để phục vụ quá trình làm việc. Hệ thống có <b>Bot dọn rác tự động</b> sẽ xóa vĩnh viễn toàn bộ dữ liệu dự án của bạn sau <b>2 giờ</b> không hoạt động nhằm bảo vệ quyền riêng tư và tuân thủ mô hình xử lý tức thời.
            </Trans>

          </p>

          <h3 className="text-white font-bold uppercase tracking-wider text-xs">{t('policyModal.sec2Title')}</h3>
          <p>
            <Trans i18nKey="policyModal.sec2Desc">
              Người dùng tự chịu hoàn toàn trách nhiệm về bản quyền và tính pháp lý của các hình ảnh, truyện tranh tải lên nền tảng. Chúng tôi chỉ cung cấp công cụ (Công nghệ AI, OCR, Typesetting) và không giữ bản quyền hay phân phối bất kỳ tác phẩm nào của người dùng.
              <br/><br/>
              Nghiêm cấm tuyệt đối việc sử dụng công cụ để tải lên, xử lý hoặc dịch thuật các ấn phẩm đồi trụy (truyện tranh 18+, hentai, doujinshi người lớn), phản động hoặc kích động bạo lực. Người dùng hoàn toàn tự chịu 100% trách nhiệm hình sự trước pháp luật Việt Nam (bao gồm <strong>Điều 326 Bộ luật Hình sự</strong> về tội truyền bá văn hóa phẩm đồi trụy) đối với bất kỳ hành vi vi phạm nào.
            </Trans>
          </p>

          <h3 className="text-white font-bold uppercase tracking-wider text-xs">{t('policyModal.sec3Title')}</h3>
          <p>
            <Trans i18nKey="policyModal.sec3Desc">
              Nghiêm cấm các hành vi sử dụng Tool tự động (Bot), gửi request rác hoặc cố tình khai thác lỗ hổng API hệ thống để làm cạn kiệt tài nguyên máy chủ. Bất kỳ tài khoản nào vi phạm sẽ bị khóa vĩnh viễn mà không cần báo trước.
            </Trans>
          </p>

          <h3 className="text-white font-bold uppercase tracking-wider text-xs">{t('policyModal.sec4Title')}</h3>
          <p>
            <Trans i18nKey="policyModal.sec4Desc">
              Dịch vụ được cung cấp "nguyên trạng". Mặc dù AI của chúng tôi được tối ưu cho truyện tranh, chúng tôi không đảm bảo bản dịch sẽ hoàn hảo 100%. Người dùng có trách nhiệm kiểm tra và chỉnh sửa lại bản dịch trước khi xuất bản.
            </Trans>
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-background/50 border-t border-border flex justify-end shrink-0">
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-sm font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all cursor-pointer">
            Tôi đã hiểu và Đồng ý
          </button>
        </div>

      </div>
    </div>
  );
}