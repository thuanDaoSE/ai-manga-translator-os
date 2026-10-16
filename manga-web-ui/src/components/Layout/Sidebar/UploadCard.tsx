import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import toast from 'react-hot-toast';

interface UploadCardProps {
  progressPercent: number;
  onFilesSelected: (files: File[]) => void;
}

export const UploadCard: React.FC<UploadCardProps> = ({
  progressPercent,
  onFilesSelected
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="px-3 pb-2 shrink-0 flex flex-col gap-2.5">
      <div
        onClick={() => fileInputRef.current?.click()}
        className="group relative flex flex-col items-center justify-center gap-1.5 py-4 bg-primary/5 hover:bg-primary/10 border border-dashed border-primary/30 hover:border-primary/60 rounded-2xl transition-all duration-300 cursor-pointer text-center select-none shadow-sm"
        title="Nhấp để chọn ảnh truyện hoặc kéo thả file vào đây"
      >
        <div className="p-2.5 bg-primary/10 rounded-xl group-hover:bg-primary/20 text-primary transition-colors duration-300">
          <Upload size={16} className="group-hover:scale-110 transition-transform duration-300" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-text-main group-hover:text-primary transition-colors">
            Tải ảnh truyện lên
          </span>
          <span className="text-[10px] text-text-muted/70">
            Kéo thả ảnh hoặc click để chọn
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/jpeg, image/png, image/webp"
          onClick={(e) => {
            (e.target as HTMLInputElement).value = '';
          }}
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;
            if (files.length > 500) {
              toast.error('Hệ thống hỗ trợ tải lên tối đa 500 trang cho mỗi phiên làm việc!');
              e.target.value = '';
              return;
            }
            onFilesSelected(files.sort((a, b) => a.name.localeCompare(b.name)));
            e.target.value = '';
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-2.5 px-2 py-0.5 select-none">
        <span className="text-[10px] font-bold text-text-muted shrink-0">Tiến độ:</span>
        <div className="flex-1 h-1.5 bg-black/45 rounded-full overflow-hidden border border-border/10 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-primary to-indigo-500 transition-all duration-500 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="text-primary text-[10.5px] font-black shrink-0">
          {Math.round(progressPercent)}%
        </span>
      </div>
    </div>
  );
};

export default UploadCard;
