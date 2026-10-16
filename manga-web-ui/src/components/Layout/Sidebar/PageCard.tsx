import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, Check, Loader2, CheckCircle2, Upload, Clock,
  AlertTriangle, Trash2, Wand2, Lock, Sparkles, RefreshCw, Square
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '../../../store/useConfigStore';
import toast from 'react-hot-toast';

export interface PageCardProps {
  id: string;
  file: File | { name: string };
  displayName?: string;
  pagesCount: number;
  isActive: boolean;
  status: 'unprocessed' | 'uploading' | 'waiting' | 'processing' | 'cleaned' | 'translating' | 'completed' | 'error';
  displayImg?: string | null;
  progress?: { percent: number; message: string } | null;
  onClick: (e: React.MouseEvent) => void;
  onTranslate: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onRetry: () => void;
  isSelected: boolean;
  isSelectionMode: boolean;
  onToggleSelection: () => void;
  hasCleanUrl: boolean;
  isProcessing: boolean;
  disabled: boolean;
  retryCount: number;
}

export const PageCard: React.FC<PageCardProps> = ({
  id,
  file,
  displayName,
  pagesCount,
  isActive,
  status,
  displayImg,
  progress,
  onClick,
  onTranslate,
  onDelete,
  onCancel,
  onRetry,
  isSelected,
  isSelectionMode,
  onToggleSelection,
  hasCleanUrl,
  isProcessing,
  disabled,
  retryCount
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: id,
    disabled: isSelectionMode
  });

  const { t } = useTranslation();
  const useGpu = useConfigStore((state) => state.useGpu);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...(!isSelectionMode ? listeners : {})}>
      <div
        onClick={(e) => {
          if (isSelectionMode) {
            e.stopPropagation();
            onToggleSelection();
          } else {
            onClick(e);
          }
        }}
        className={`w-full text-left rounded-xl flex items-center p-2.5 transition-colors border group relative outline-none min-h-[5.5rem] ${
          isSelectionMode ? 'cursor-pointer' : 'cursor-grab'
        } ${
          isDragging
            ? 'opacity-50 shadow-2xl scale-105 border-primary bg-primary/20'
            : isSelected
              ? 'bg-primary/15 border-primary/50 shadow-md ring-1 ring-primary/50'
              : isActive
                ? 'bg-primary/10 border-primary/40 shadow-lg'
                : status === 'error'
                  ? 'bg-danger/5 border-danger/30 hover:bg-danger/10'
                  : status === 'waiting'
                    ? 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/10'
                    : 'bg-panel/40 border-transparent hover:border-border hover:bg-panel/60'
        }`}
      >
        {/* DRAG HANDLE */}
        {!isSelectionMode && (
          <div
            ref={setActivatorNodeRef}
            className="flex shrink-0 w-5 h-full items-center justify-center opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity text-text-muted"
          >
            <GripVertical size={16} />
          </div>
        )}

        {/* CHECKBOX (SELECTION MODE) */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelection();
          }}
          className={`absolute left-2.5 z-20 w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer shadow-sm border ${
            isSelected
              ? 'bg-primary border-primary text-white opacity-100 scale-100'
              : 'bg-background/90 border-border text-transparent hover:border-primary opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'
          } ${isSelectionMode && !isSelected ? 'opacity-100' : ''}`}
        >
          <Check size={14} strokeWidth={3} className={isSelected ? 'opacity-100' : 'opacity-0'} />
        </div>

        {/* THUMBNAIL */}
        <div
          className={`relative w-14 h-20 shrink-0 rounded-lg overflow-hidden border border-border bg-black/40 transition-transform shadow-sm ${
            isSelectionMode && !isSelected ? 'ml-6' : isSelected ? 'ml-6' : !isSelectionMode ? 'ml-1' : ''
          }`}
        >
          {displayImg ? (
            <img
              src={displayImg}
              className={`w-full h-full object-cover ${
                status === 'processing' || isProcessing || status === 'error'
                  ? 'blur-[2px] opacity-50 scale-110'
                  : ''
              } ph-no-capture`}
              alt="thumb"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-800">
              <Loader2 className="animate-spin text-gray-600" size={16} />
            </div>
          )}

          {(status === 'processing' || status === 'uploading' || isProcessing) && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
              <Loader2 className="animate-spin text-white" size={20} />
            </div>
          )}
          {status === 'completed' && (
            <div className="absolute top-1 right-1 bg-emerald-500 rounded-full p-0.5 shadow-sm">
              <CheckCircle2 size={10} className="text-white" />
            </div>
          )}
        </div>

        {/* INFO & STATUS */}
        <div
          className={`flex flex-col gap-1 overflow-hidden flex-1 min-w-0 pl-3 justify-center transition-all duration-300 ${
            status === 'processing' || status === 'waiting' || status === 'uploading'
              ? 'pr-12'
              : 'pr-[80px]'
          }`}
        >
          <span
            className={`text-xs font-bold truncate block w-full ${
              isActive || isSelected
                ? 'text-primary'
                : status === 'error'
                  ? 'text-danger'
                  : 'text-text-main'
            }`}
          >
            {displayName || file.name}
          </span>
          {pagesCount > 1 && (
            <span className="text-[9px] text-primary font-black uppercase mt-0.5 bg-primary/10 px-1.5 py-0.5 rounded-md inline-block w-fit">
              Webtoon
            </span>
          )}

          {status === 'uploading' && (
            <span className="flex items-center gap-1.5 text-[10px] text-blue-400 font-bold uppercase truncate animate-pulse">
              <Upload size={12} className="animate-bounce" /> Đang tải ảnh lên...
            </span>
          )}
          {(status === 'unprocessed' || status === 'cleaned' || status === 'translating') && (
            <span className="flex items-center gap-1.5 text-[10px] text-text-muted font-bold uppercase truncate">
              <Clock size={12} /> {t('sidebar.waiting')}
            </span>
          )}
          {status === 'waiting' && (
            <span className="flex items-center gap-1.5 text-[10px] text-amber-500 font-bold uppercase truncate animate-pulse">
              <Clock size={12} /> {t('sidebar.waitingQueue')}
            </span>
          )}

          {status === 'processing' && (
            <div className="flex flex-col gap-1.5 mt-0.5 w-full">
              <span className="text-[9.5px] text-amber-400 font-bold uppercase line-clamp-2 leading-snug w-full tracking-wide">
                {progress ? `${Math.round(progress.percent)}% - ${progress.message}` : t('sidebar.startingAi')}
              </span>
              <div className="w-full bg-black/40 rounded-full h-1.5 border border-border/40 overflow-hidden shrink-0 shadow-inner">
                <div
                  className="bg-gradient-to-r from-amber-500 to-amber-300 h-full rounded-full transition-all duration-300 ease-out relative"
                  style={{ width: `${progress ? progress.percent : 0}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>
            </div>
          )}

          {status === 'completed' && (
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-black uppercase truncate">
              <CheckCircle2 size={12} /> {t('sidebar.completed')}
            </span>
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1.5 text-[10px] text-danger font-bold uppercase truncate">
              <AlertTriangle size={12} className="shrink-0" /> {t('sidebar.transError', 'Lỗi Dịch')}
            </span>
          )}
          {retryCount >= 3 && (
            <span
              className="flex items-center gap-1 text-[9.5px] text-orange-400 font-bold uppercase truncate mt-0.5"
              title="AI đã đạt giới hạn dịch tự động cho đoạn này. Vui lòng chỉnh sửa bản dịch thủ công để có kết quả tốt nhất."
            >
              <AlertTriangle size={11} className="shrink-0 text-orange-400 animate-pulse" /> Đạt giới hạn AI
            </span>
          )}
        </div>

        {/* ACTION BUTTONS (HOVER) */}
        {!isSelectionMode && status !== 'processing' && status !== 'waiting' && status !== 'uploading' && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex flex-col items-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
            <button
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (disabled) return;
                onDelete();
              }}
              className={`p-2 text-text-muted hover:bg-danger hover:text-white rounded-lg transition-colors bg-background/80 backdrop-blur-md border border-border/50 shadow-sm shrink-0 ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
              title={t('sidebar.deletePage')}
            >
              <Trash2 size={14} />
            </button>

            {(status === 'unprocessed' || status === 'cleaned' || status === 'translating') && (
              <button
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (disabled) return;
                  if (!useGpu) {
                    useConfigStore.getState().setUseGpu(true);
                    setTimeout(() => {
                      useConfigStore.getState().saveToLocal();
                    }, 50);
                    toast.success('Đã mở khóa GPU Premium ⚡');
                    return;
                  }
                  onTranslate();
                }}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-[11px] font-bold shadow-sm transition-all cursor-pointer ${
                  disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
                } ${
                  useGpu
                    ? 'bg-primary hover:bg-primary-hover border border-purple-400/80 shadow-[0_0_10px_rgba(168,85,247,0.55)]'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-text-muted border border-border/40 opacity-70 grayscale'
                }`}
              >
                {useGpu ? <Wand2 size={11} className="shrink-0" /> : <Lock size={11} className="shrink-0" />}
                <span>{t('canvas.translateAction', 'Dịch')}</span>
              </button>
            )}

            {status === 'error' && (
              <button
                disabled={disabled || (hasCleanUrl && retryCount >= 3)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (disabled || (hasCleanUrl && retryCount >= 3)) return;
                  if (!useGpu) {
                    useConfigStore.getState().setUseGpu(true);
                    setTimeout(() => {
                      useConfigStore.getState().saveToLocal();
                    }, 50);
                    toast.success('Đã mở khóa GPU Premium ⚡');
                    return;
                  }
                  hasCleanUrl ? onRetry() : onTranslate();
                }}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-[11px] font-bold shadow-sm transition-all cursor-pointer ${
                  disabled || (hasCleanUrl && retryCount >= 3)
                    ? 'opacity-50 cursor-not-allowed pointer-events-none grayscale'
                    : ''
                } ${
                  useGpu
                    ? 'bg-danger hover:bg-red-600 border border-purple-400/80 shadow-[0_0_10px_rgba(168,85,247,0.55)]'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-text-muted border border-border/40 opacity-70 grayscale'
                }`}
              >
                {useGpu ? (
                  hasCleanUrl ? (
                    <>
                      <Sparkles size={11} className={retryCount >= 3 ? '' : 'animate-pulse'} />
                      <span>Dịch lại</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={12} />
                      <span>{t('sidebar.retrySingle')}</span>
                    </>
                  )
                ) : (
                  <>
                    <Lock size={11} />
                    <span>Dịch lại</span>
                  </>
                )}
              </button>
            )}

            {status === 'completed' && (
              <div className="relative shrink-0">
                <button
                  disabled={disabled || retryCount >= 3}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (disabled || retryCount >= 3) return;
                    if (!useGpu) {
                      useConfigStore.getState().setUseGpu(true);
                      setTimeout(() => {
                        useConfigStore.getState().saveToLocal();
                      }, 50);
                      toast.success('Đã mở khóa GPU Premium ⚡');
                      return;
                    }
                    onRetry();
                  }}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold shadow-sm transition-all cursor-pointer ${
                    disabled || retryCount >= 3 ? 'opacity-50 cursor-not-allowed pointer-events-none grayscale' : ''
                  } ${
                    useGpu
                      ? 'bg-background/95 backdrop-blur-md border border-purple-400/80 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.45)]'
                      : 'bg-neutral-800/80 backdrop-blur-md border border-border/40 text-text-muted hover:bg-neutral-700 opacity-70'
                  }`}
                  title={t('sidebar.retranslate')}
                >
                  {useGpu ? <Sparkles size={11} className={retryCount >= 3 ? '' : 'animate-pulse'} /> : <Lock size={11} />}
                  <span>Dịch lại</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* STOP BUTTON */}
        {!isSelectionMode && (status === 'processing' || status === 'waiting') && (
          <div
            className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
          >
            <button
              className="flex items-center justify-center w-8 h-8 bg-background/90 backdrop-blur-md hover:bg-danger text-danger hover:text-white border border-danger/30 hover:border-danger rounded-lg shadow-sm transition-all cursor-pointer group"
              title={status === 'waiting' ? t('sidebar.cancelQueue') : t('sidebar.stop')}
            >
              <Square size={14} className="fill-current group-hover:scale-90 transition-transform" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PageCard;
