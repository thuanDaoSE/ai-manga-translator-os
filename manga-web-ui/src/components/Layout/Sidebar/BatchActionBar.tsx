import React from 'react';
import { X, Square, Sparkles, Download, Layers, Package, FileImage } from 'lucide-react';

interface BatchActionBarProps {
  isSelectionMode: boolean;
  selectedCount: number;
  onClearSelection: () => void;
  selectedProcessingCount: number;
  onCancelSelected: () => void;
  selectedUnprocessedCount: number;
  hasQuota: boolean;
  isAnyProcessingOrWaiting: boolean;
  onTranslateSelected: () => void;
  isExportMenuOpen: boolean;
  onToggleExportMenu: () => void;
  onExportBatch: (type: 'psd' | 'clean' | 'raw') => void;
  t: (key: string, defaultValue?: string) => string;
}

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  isSelectionMode,
  selectedCount,
  onClearSelection,
  selectedProcessingCount,
  onCancelSelected,
  selectedUnprocessedCount,
  hasQuota,
  isAnyProcessingOrWaiting,
  onTranslateSelected,
  isExportMenuOpen,
  onToggleExportMenu,
  onExportBatch,
  t
}) => {
  const nothingToTranslate = selectedUnprocessedCount === 0;

  return (
    <>
      {isExportMenuOpen && (
        <div className="fixed inset-0 z-[9998]" onClick={onToggleExportMenu} />
      )}
      <div
        className={`fixed top-20 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-4 p-2 pl-4 
          bg-panel/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]
          ${isSelectionMode ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-16 opacity-0 scale-95 pointer-events-none'}
        `}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-primary/20 text-primary text-xs font-bold transition-all">
            <span>{selectedCount}</span>
          </div>
          <span className="text-sm font-semibold text-text-main select-none">
            {t('sidebar.selectedPages', 'Đã chọn')}
          </span>
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        <button
          onClick={onClearSelection}
          className="p-2 rounded-xl text-text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
          title={t('sidebar.cancelSelection', 'Hủy chọn')}
        >
          <X size={18} strokeWidth={2.5} />
        </button>

        <div className="flex items-center gap-2">
          {selectedProcessingCount > 0 && (
            <button
              onClick={onCancelSelected}
              className="flex items-center gap-1.5 py-2 px-3 text-xs font-bold rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-all cursor-pointer"
              title="Dừng dịch các trang đã chọn đang xử lý"
            >
              <Square size={13} fill="currentColor" />
              <span>Dừng ({selectedProcessingCount})</span>
            </button>
          )}

          <button
            onClick={onTranslateSelected}
            disabled={nothingToTranslate || !hasQuota || isAnyProcessingOrWaiting}
            title={nothingToTranslate ? 'Không có trang nào cần dịch' : !hasQuota ? 'Hệ thống đã đạt giới hạn 300 trang miễn phí. Vui lòng chờ admin reset!' : `Dịch ${selectedUnprocessedCount} trang`}
            className={`relative flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-bold rounded-xl transition-all active:scale-95 shadow-md
              ${nothingToTranslate || isAnyProcessingOrWaiting
                ? 'bg-border/30 text-text-muted cursor-not-allowed border border-transparent'
                : !hasQuota
                  ? 'bg-danger/10 border border-danger/30 text-danger cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-black border border-purple-400/80 shadow-[0_0_15px_rgba(168,85,247,0.55)] cursor-pointer'
              }`}
          >
            <Sparkles size={15} strokeWidth={2.5} />
            {!hasQuota && !nothingToTranslate ? (
              <span>Hết lượt miễn phí (0/300)</span>
            ) : (
              <span>Dịch {selectedUnprocessedCount > 0 ? selectedUnprocessedCount : selectedCount} trang</span>
            )}
          </button>
        </div>

        <div className="relative">
          <button
            onClick={onToggleExportMenu}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-primary hover:bg-primary-hover active:scale-95 text-white rounded-xl shadow-lg shadow-primary/20 transition-all cursor-pointer"
          >
            <Download size={16} strokeWidth={2.5} />
            {t('sidebar.downloadDropdown', 'Tải xuống')}
          </button>

          <div
            className={`absolute top-[calc(100%+12px)] right-0 w-72 bg-panel border border-border shadow-2xl rounded-2xl p-1.5 transition-all origin-top-right duration-200 ease-out z-[101]
              ${isExportMenuOpen ? 'opacity-100 scale-100 pointer-events-auto translate-y-0' : 'opacity-0 scale-95 pointer-events-none -translate-y-2'}
            `}
          >
            <div className="px-3 pt-2.5 pb-2 mb-1 border-b border-border">
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
                {t('sidebar.exportFormat', 'Định dạng xuất')}
              </span>
            </div>

            <button
              onClick={() => onExportBatch('psd')}
              className="w-full flex items-center gap-3 px-3 py-3 text-sm text-text-main hover:bg-background/80 rounded-xl transition-colors text-left group cursor-pointer"
            >
              <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                <Layers size={18} className="text-blue-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold">File PSD (Photoshop)</span>
                <span className="text-[11px] text-text-muted font-medium">{t('sidebar.layeredTrans', 'Từng layer chữ riêng biệt')}</span>
              </div>
            </button>

            <button
              onClick={() => onExportBatch('clean')}
              className="w-full flex items-center gap-3 px-3 py-3 text-sm text-text-main hover:bg-background/80 rounded-xl transition-colors text-left group cursor-pointer"
            >
              <div className="p-2 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                <Package size={18} className="text-emerald-500" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold">{t('sidebar.transJpg', 'Ảnh đã dịch (Clean/Merge)')}</span>
                <span className="text-[11px] text-text-muted font-medium">Ảnh đã xóa nền và ghép chữ</span>
              </div>
            </button>

            <button
              onClick={() => onExportBatch('raw')}
              className="w-full flex items-center gap-3 px-3 py-3 text-sm text-text-main hover:bg-background/80 rounded-xl transition-colors text-left group cursor-pointer"
            >
              <div className="p-2 bg-border/40 rounded-lg group-hover:bg-border/60 transition-colors">
                <FileImage size={18} className="text-text-muted" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold">Ảnh Gốc (RAW)</span>
                <span className="text-[11px] text-text-muted font-medium">Bản scan chưa qua xử lý</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default BatchActionBar;
