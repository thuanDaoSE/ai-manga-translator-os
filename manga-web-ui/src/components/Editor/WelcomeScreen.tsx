import { useState } from 'react';
import { Upload, FolderArchive, FileText } from 'lucide-react';
import { useMangaUpload } from '../../hooks/useMangaUpload';
import PolicyModal from '../Modals/PolicyModal';
import { cn } from '../../utils';

export default function WelcomeScreen() {
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          
          {/* New Project Card */}
          <label
            className={cn(
              "flex flex-col items-start p-4 rounded-xl border transition-all duration-300 outline-none select-none text-left relative overflow-hidden group",
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
                Dự án mới
              </span>
            </div>
            
            <span className={cn(
              "text-xs leading-normal transition-colors duration-300",
              isAgreed ? "text-slate-400" : "text-text-muted/30"
            )}>
              Tải lên các trang scan RAW (.jpg, .png, .webp). Hỗ trợ tối đa 20 trang.
            </span>
            <input
              type="file"
              multiple
              accept="image/jpeg, image/png, image/webp"
              className="sr-only"
              disabled={!isAgreed}
              onChange={handleFileChange}
              aria-label="Tải lên dự án mới"
            />
          </label>

          {/* Restore Card */}
          <label
            className={cn(
              "flex flex-col items-start p-4 rounded-xl border transition-all duration-300 outline-none select-none text-left relative overflow-hidden group",
              "focus-within:ring-2 focus-within:ring-indigo-500/50",
              isAgreed
                ? "cursor-pointer border-white/5 bg-white/5 backdrop-blur-md hover:bg-white/10 hover:border-white/10 hover:scale-[1.01]"
                : "opacity-40 cursor-not-allowed bg-panel/10 border-border/40 text-text-muted/40"
            )}
            aria-disabled={!isAgreed}
          >
            <div className="flex items-center gap-3 mb-2 w-full">
              <div className={cn(
                "p-2 rounded-lg transition-all duration-300 shrink-0",
                isAgreed
                  ? "bg-white/10 text-slate-300 group-hover:scale-105"
                  : "bg-panel/20 border border-border/20 text-text-muted/30"
              )}>
                <FolderArchive size={18} />
              </div>
              <span className={cn(
                "font-bold text-sm transition-colors duration-300",
                isAgreed ? "text-slate-100" : "text-text-muted/50"
              )}>
                Khôi phục tiến trình
              </span>
            </div>
            
            <span className={cn(
              "text-xs leading-normal transition-colors duration-300",
              isAgreed ? "text-slate-500" : "text-text-muted/30"
            )}>
              Mở tệp sao lưu định dạng .manga để khôi phục lại các layer đã dịch.
            </span>
            <input
              type="file"
              accept=".manga"
              className="sr-only"
              disabled={!isAgreed}
              onChange={handleImportManga}
              aria-label="Khôi phục tiến trình từ file .manga"
            />
          </label>

        </div>

      </div>

      {/* Footer Area for Policy checkbox */}
      <div className={cn("mt-auto pt-6 border-t border-border/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 max-w-xl w-full text-xs text-text-muted")}>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="policy-checkbox"
            checked={isAgreed}
            onChange={(e) => setIsAgreed(e.target.checked)}
            className={cn("w-3.5 h-3.5 rounded border-border bg-panel text-primary accent-primary cursor-pointer focus:ring-0 focus:ring-offset-0")}
          />
          <label htmlFor="policy-checkbox" className="cursor-pointer select-none text-text-muted hover:text-text-main">
            Tôi đồng ý với{' '}
            <button
              onClick={(e) => {
                e.preventDefault();
                setIsPolicyOpen(true);
              }}
              className="text-text-main font-semibold hover:underline"
            >
              Điều khoản & Chính sách
            </button>{' '}
            của hệ thống và cam kết chịu trách nhiệm bản quyền.
          </label>
        </div>
        <div className="flex items-center gap-2 text-text-muted/60">
          <FileText size={12} />
          <span>Phiên bản 2.1.0-alpha</span>
        </div>
      </div>

      <PolicyModal isOpen={isPolicyOpen} onClose={() => setIsPolicyOpen(false)} />
    </div>
  );
}