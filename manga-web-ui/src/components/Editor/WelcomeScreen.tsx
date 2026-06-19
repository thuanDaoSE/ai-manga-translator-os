import { useState } from 'react';
import { Upload, FolderArchive, FileText } from 'lucide-react';
import { useMangaUpload } from '../../hooks/useMangaUpload';
import PolicyModal from '../Modals/PolicyModal';
import { cn } from '../../utils';
import { useTranslation, Trans } from 'react-i18next';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const {
    isAgreed,
    setIsAgreed,
    handleFileChange,
    handleImportManga,
  } = useMangaUpload();

  const [isPolicyOpen, setIsPolicyOpen] = useState(false);

  return (
    <div className={cn("flex flex-col w-full h-full bg-background text-text-main p-8 select-none font-sans overflow-y-auto items-center justify-between")}>
      
      {/* Centered Main Content Area */}
      <div className={cn("max-w-xl w-full flex-1 flex flex-col justify-center items-center gap-10 my-auto")}>
        
        {/* Workspace Title & Intro */}
        <header className="text-center">
          <h1 className={cn("font-serif text-4xl md:text-5xl font-light italic tracking-wide text-text-main/90")}>
            Manga AI Editor
          </h1>
        </header>

        {/* Primary Actions Section */}
        <div className="flex justify-center w-full">
          
          {/* New Project Card */}
          <label
            className={cn(
              "flex flex-col items-start p-4 rounded-xl border transition-all duration-300 outline-none select-none text-left relative overflow-hidden group w-full max-w-sm",
              "focus-within:ring-2 focus-within:ring-indigo-500/50",
              isAgreed
                ? "cursor-pointer border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 backdrop-blur-md shadow-[0_0_20px_rgba(99,102,241,0.08)] hover:scale-[1.01] hover:border-indigo-400/40"
                : "opacity-40 cursor-not-allowed bg-panel/10 border-border/40 text-text-muted/40"
            )}
            aria-disabled={!isAgreed}
          >
            {/* Subtle glow hover effect overlay */}
            {isAgreed && (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(99,102,241,0.05),transparent_60%)] pointer-events-none transition-opacity duration-300" />
            )}
            
            <div className="flex items-center gap-3 mb-2 w-full">
              <div className={cn(
                "p-2 rounded-lg transition-all duration-300 shrink-0",
                isAgreed
                  ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md group-hover:scale-105"
                  : "bg-panel/20 border border-border/20 text-text-muted/30"
              )}>
                <Upload size={18} />
              </div>
              <span className={cn(
                "font-bold text-sm transition-colors duration-300",
                isAgreed ? "text-white" : "text-text-muted/50"
              )}>
                {t('welcome.newProject')}
              </span>
            </div>
            
            <span className={cn(
              "text-xs leading-normal transition-colors duration-300",
              isAgreed ? "text-slate-400" : "text-text-muted/30"
            )}>
              {t('welcome.newProjectDesc')}
            </span>
            <input
              type="file"
              multiple
              accept="image/jpeg, image/png, image/webp"
              className="sr-only"
              disabled={!isAgreed}
              onChange={handleFileChange}
              aria-label={t('welcome.uploadLabel')}
            />
          </label>

        </div>

      </div>

      {/* Footer Area for Policy checkbox */}
      <div className={cn("mt-auto pt-6 border-t border-border/40 flex flex-col items-start gap-4 max-w-xl w-full text-xs text-text-muted")}>
        <div className="flex gap-2.5 bg-red-500/5 border border-red-500/10 p-4 rounded-xl text-[11px] leading-relaxed text-gray-300 w-full">
          <input
            type="checkbox"
            id="policy-checkbox"
            checked={isAgreed}
            onChange={(e) => setIsAgreed(e.target.checked)}
            className={cn("mt-1 shrink-0 cursor-pointer accent-indigo-500 rounded border-gray-700 bg-neutral-900 w-4 h-4")}
          />
          <label htmlFor="policy-checkbox" className="leading-relaxed cursor-pointer select-none flex-1">
            <span className="font-bold text-gray-200 block mb-1">{t('paywall.disclaimerHeader')}</span>
            <ul className="list-disc pl-4 space-y-1.5 text-gray-400 text-[10px]">
              <li>
                <Trans i18nKey="paywall.disclaimerItem1">
                  (1) <strong>Trách nhiệm của bạn:</strong> Tôi xác nhận có quyền sử dụng hợp pháp đối với các hình ảnh tải lên. Deepkoma được miễn trừ mọi rắc rối về tranh chấp bản quyền bên thứ ba.
                </Trans>
              </li>
              <li>
                <Trans i18nKey="paywall.disclaimerItem2">
                  (2) <strong>Cam kết của Deepkoma:</strong> Chúng tôi KHÔNG lưu trữ vĩnh viễn, KHÔNG tuyên bố sở hữu và KHÔNG phân phối lại dữ liệu của bạn. Mọi tệp tin sẽ bị xóa tự động sau <strong>2</strong> giờ để bảo vệ quyền riêng tư tuyệt đối.
                </Trans>
              </li>
              <li>
                <Trans i18nKey="paywall.disclaimerItem3">
                  (3) Tôi hoàn toàn <strong>tự chịu trách nhiệm trước pháp luật Việt Nam</strong>.
                </Trans>
              </li>
              <li>
                <Trans i18nKey="paywall.disclaimerItem4">
                  (4) Nghiêm cấm sử dụng để xử lý ảnh/truyện <strong>đồi trụy (18+), phản động</strong>. Hệ thống sẽ tự động xóa dữ liệu sau <strong>2</strong> giờ.
                </Trans>
              </li>
            </ul>
          </label>
        </div>
        <div className="flex items-center justify-between w-full text-text-muted/60 text-[10px]">
          <div className="flex items-center gap-1.5">
            <FileText size={12} />
            <span>{t('welcome.appVersion')}</span>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              setIsPolicyOpen(true);
            }}
            className="hover:text-text-main underline transition-colors"
          >
            {t('welcome.policyLinkText', 'Điều khoản & Chính sách')}
          </button>
        </div>
      </div>

      <PolicyModal isOpen={isPolicyOpen} onClose={() => setIsPolicyOpen(false)} />
    </div>
  );
}