import { useState } from 'react';
import { Upload, FileText, Lock } from 'lucide-react';
import { useMangaUpload } from '../../hooks/useMangaUpload';
import PolicyModal from '../Modals/PolicyModal';
import { cn } from '../../utils';
import { useTranslation } from 'react-i18next';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const {
    handleFileChange,
  } = useMangaUpload();

  const [isPolicyOpen, setIsPolicyOpen] = useState(false);

  return (
    <div className={cn("flex flex-col w-full h-full bg-background text-text-main p-8 select-none font-sans overflow-y-auto items-center justify-between")}>
      
      {/* Centered Main Content Area */}
      <div className={cn("max-w-xl w-full flex-1 flex flex-col justify-center items-center gap-8 my-auto")}>
        
        {/* Workspace Title & Intro */}
        <header className="text-center">
          <h1 className={cn("font-serif text-4xl md:text-5xl font-light italic tracking-wide text-text-main/90")}>
            Manga AI Editor
          </h1>
        </header>

        {/* Primary Actions Section */}
        <div className="flex flex-col items-center justify-center w-full">
          
          {/* New Project Card */}
          <label
            className={cn(
              "flex flex-col items-start p-5 rounded-xl border transition-all duration-300 outline-none select-none text-left relative overflow-hidden group w-full max-w-sm cursor-pointer",
              "focus-within:ring-2 focus-within:ring-indigo-500/50",
              "border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 backdrop-blur-md shadow-[0_0_20px_rgba(99,102,241,0.08)] hover:scale-[1.01] hover:border-indigo-400/40"
            )}
          >
            {/* Subtle glow hover effect overlay */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(99,102,241,0.05),transparent_60%)] pointer-events-none transition-opacity duration-300" />
            
            <div className="flex items-center gap-3 mb-2 w-full">
              <div className="p-2 rounded-lg transition-all duration-300 shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md group-hover:scale-105">
                <Upload size={18} />
              </div>
              <span className="font-bold text-sm transition-colors duration-300 text-white">
                {t('welcome.newProject')}
              </span>
            </div>
            
            <span className="text-xs leading-normal transition-colors duration-300 text-slate-400">
              {t('welcome.newProjectDesc')}
            </span>
            <input
              type="file"
              multiple
              accept="image/jpeg, image/png, image/webp"
              className="sr-only"
              onChange={handleFileChange}
              aria-label={t('welcome.uploadLabel')}
            />
          </label>

          {/* Privacy & Action-based Agreement note */}
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted/80 text-center select-none max-w-md mt-4">
            <Lock size={12} className="text-emerald-400 shrink-0" />
            <span>
              {t('welcome.privacyNoticePrefix', 'Ảnh của bạn được xử lý riêng tư trên GPU và tự động hủy sau phiên. Bằng việc tải tệp lên, bạn đồng ý với')}{' '}
              <button
                type="button"
                onClick={() => setIsPolicyOpen(true)}
                className="underline hover:text-white transition-colors cursor-pointer"
              >
                {t('welcome.termsOfService', 'Điều khoản dịch vụ')}
              </button>.
            </span>
          </div>

        </div>

      </div>

      {/* Footer Area */}
      <div className={cn("mt-auto pt-6 border-t border-border/40 flex items-center justify-between max-w-xl w-full text-text-muted/60 text-[10px]")}>
        <div className="flex items-center gap-1.5">
          <FileText size={12} />
          <span>{t('welcome.appVersion')}</span>
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            setIsPolicyOpen(true);
          }}
          className="hover:text-text-main underline transition-colors cursor-pointer"
        >
          {t('welcome.policyLinkText', 'Điều khoản & Chính sách')}
        </button>
      </div>

      <PolicyModal isOpen={isPolicyOpen} onClose={() => setIsPolicyOpen(false)} />
    </div>
  );
}