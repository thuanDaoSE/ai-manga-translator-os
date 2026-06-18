import React, { useState, useRef, useEffect } from 'react';
import { Upload, AlertCircle, RefreshCw, FileText, CheckCircle2, Sparkles } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { getAuthHeaders } from '../services/api';

const BoltIcon = () => (
  <svg className="w-3 h-3 text-amber-500 fill-current inline-block align-middle" viewBox="-11 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.84 26.24c-0.080 0-0.16 0-0.24-0.040-0.4-0.12-0.64-0.52-0.56-0.92l1.32-9.16h-1.52c-0.24 0-0.52-0.12-0.68-0.32s-0.2-0.48-0.16-0.72l2.32-8.68c0.080-0.36 0.44-0.64 0.8-0.64h5.56c0.28 0 0.56 0.16 0.72 0.4s0.16 0.56 0.040 0.8l-2.6 5.12h1.24c0.28 0 0.56 0.16 0.72 0.4s0.16 0.56 0.040 0.8l-6.24 12.48c-0.12 0.28-0.44 0.48-0.76 0.48zM1.92 14.44h1.4c0.24 0 0.48 0.12 0.64 0.28 0.16 0.2 0.24 0.44 0.2 0.68l-0.72 4.92 3.28-6.56h-1.24c-0.28 0-0.56-0.16-0.72-0.4s-0.16-0.56-0.040-0.8l2.6-5.12h-3.56l-1.84 7z"></path>
  </svg>
);

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const MangaProcessor: React.FC = () => {
  const { user } = useAuthStore();
  const [originalImageFile, setOriginalImageFile] = useState<File | null>(null);
  const [displayImageUrl, setDisplayImageUrl] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('Clean and translate this page');
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [translations, setTranslations] = useState<string[]>([]);
  const [processingState, setProcessingState] = useState<'idle' | 'uploading' | 'nsfw_passed' | 'text_detected' | 'image_ready' | 'done'>('idle');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpeg'>('jpeg');
  const [qualityLevel, setQualityLevel] = useState<number>(2);

  // Image scaling references
  const imageRef = useRef<HTMLImageElement>(null);
  const [renderedDims, setRenderedDims] = useState<{ width: number; height: number } | null>(null);
  const [naturalDims, setNaturalDims] = useState<{ width: number; height: number } | null>(null);

  // Recalculate dimensions on resize
  const updateDimensions = () => {
    if (imageRef.current) {
      setRenderedDims({
        width: imageRef.current.clientWidth,
        height: imageRef.current.clientHeight,
      });
      setNaturalDims({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight,
      });
    }
  };

  useEffect(() => {
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setOriginalImageFile(file);
      setDisplayImageUrl(URL.createObjectURL(file));
      setBoxes([]);
      setTranslations([]);
      setProcessingState('idle');
      setErrorMsg('');
    }
  };

  const startStreamProcessing = async () => {
    if (!originalImageFile) return;

    setIsProcessing(true);
    setProcessingState('uploading');
    setErrorMsg('');
    setBoxes([]);
    setTranslations([]);

    const formData = new FormData();
    formData.append('image', originalImageFile);
    formData.append('prompt', prompt);
    formData.append('output_format', outputFormat);
    formData.append('quality_level', qualityLevel.toString());

    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const authHeaders = await getAuthHeaders(true);
      const response = await fetch(`${baseUrl}/api/v1/ai-process`, {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server returned status: ${response.statusText} (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('ReadableStream is not supported on this browser.');
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split messages by SSE double newline boundary
        const parts = buffer.split('\n\n');
        // Save the tail buffer part (might be incomplete)
        buffer = parts.pop() || '';

        for (const part of parts) {
          const cleanPart = part.trim();
          if (!cleanPart) continue;

          if (cleanPart.startsWith('data: ')) {
            const jsonStr = cleanPart.slice(6).trim();
            let event: any;
            try {
              event = JSON.parse(jsonStr);
            } catch (jsonErr: any) {
              console.error('Error parsing JSON chunk:', jsonErr, jsonStr);
              continue;
            }
              
            if (event.status === 'error') {
              throw new Error(event.message || 'An error occurred during processing.');
            }

            // Update state based on status
            switch (event.status) {
                case 'nsfw_passed':
                  setProcessingState('nsfw_passed');
                  break;
                case 'text_detected':
                  setProcessingState('text_detected');
                  setBoxes(event.boxes || []);
                  break;
                case 'image_ready':
                  setProcessingState('image_ready');
                  setDisplayImageUrl(`data:image/png;base64,${event.image_base64}`);
                  break;
                case 'image_failed': {
                  const errMsg = event.error || 'Unknown error';
                  console.error("Kie.ai Image redraw failed:", errMsg);
                  if (errMsg.toLowerCase().includes('nsfw') || errMsg.toLowerCase().includes('content check') || errMsg.toLowerCase().includes('nhạy cảm')) {
                    throw new Error(`NSFW: ${errMsg}`);
                  }
                  setErrorMsg(`Image redraw failed: ${errMsg}`);
                  break;
                }
                case 'translation_ready':
                  setProcessingState('done');
                  setTranslations(event.translations || []);
                  setIsProcessing(false);
                  break;
              }
          }
        }
      }
    } catch (err: any) {
      console.error('Processing error:', err);
      setErrorMsg(err.message || 'An unexpected error occurred.');
      setProcessingState('idle');
      setIsProcessing(false);
    }
  };

  const getStepClass = (step: string) => {
    const states = ['uploading', 'nsfw_passed', 'text_detected', 'image_ready', 'done'];
    const currentIndex = states.indexOf(processingState);
    const stepIndex = states.indexOf(step);

    if (processingState === 'idle') {
      return 'text-slate-400 border-slate-700 bg-slate-800/30';
    }

    if (currentIndex > stepIndex || processingState === 'done') {
      return 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]';
    }
    if (currentIndex === stepIndex) {
      return 'text-indigo-400 border-indigo-500 bg-indigo-500/10 animate-pulse shadow-[0_0_15px_rgba(99,102,241,0.25)]';
    }
    return 'text-slate-500 border-slate-800 bg-slate-900/30';
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6 bg-slate-950/80 backdrop-blur-md rounded-2xl border border-slate-900 shadow-2xl text-slate-100">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-900">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-indigo-600 to-violet-600 rounded-xl shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-wide bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Manga AI Translation Hub
            </h2>
            <p className="text-xs text-slate-500">FastAPI SSE Parallel Redraw & OCR Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Active Engine</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Settings Panel */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="p-5 bg-slate-900/40 rounded-xl border border-slate-900/80 flex flex-col gap-4">
            <h3 className="text-sm font-semibold tracking-wider uppercase text-slate-400">Upload & Config</h3>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 font-medium">1. Select Manga Page</label>
              <div className="relative group flex flex-col items-center justify-center border-2 border-dashed border-slate-800 hover:border-indigo-500/50 bg-slate-950 rounded-xl p-6 transition-all duration-300">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={isProcessing}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <Upload className="w-8 h-8 text-slate-600 group-hover:text-indigo-400 mb-3 transition-colors" />
                <span className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                  {originalImageFile ? originalImageFile.name : 'Choose file or drag here'}
                </span>
                <span className="text-[10px] text-slate-600 mt-1">Supports PNG, JPG, WebP</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 font-medium">2. AI Redraw Instruction Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isProcessing}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 text-slate-200 text-sm rounded-xl p-3 outline-none resize-none h-24 focus:ring-1 focus:ring-indigo-500/30 transition-all disabled:opacity-50"
                placeholder="Enter scene details to guide AI redraw..."
              />
            </div>



            <button
              onClick={startStreamProcessing}
              disabled={isProcessing || !originalImageFile}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-slate-800 disabled:to-slate-800 text-white font-semibold text-sm rounded-xl shadow-lg disabled:shadow-none hover:shadow-indigo-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing Pipeline...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Start AI Translation
                </>
              )}
            </button>
          </div>

          {/* Pipeline Tracker */}
          <div className="p-5 bg-slate-900/40 rounded-xl border border-slate-900/80 flex flex-col gap-4">
            <h3 className="text-sm font-semibold tracking-wider uppercase text-slate-400">Pipeline Progress</h3>

            <div className="flex flex-col gap-3">
              {[
                { key: 'uploading', label: 'Image Base64 Encoded' },
                { key: 'nsfw_passed', label: 'NSFW Content Checked' },
                { key: 'text_detected', label: 'RunPod Text & Bounding Boxes OCR' },
                { key: 'image_ready', label: 'Grok Imagine Clean Redraw (Inpaint)' },
                { key: 'done', label: 'DeepSeek Vietnamese Translation' },
              ].map((step, idx) => (
                <div
                  key={step.key}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 ${getStepClass(step.key)}`}
                >
                  <div className="flex-shrink-0">
                    {idx + 1 === 5 && processingState === 'done' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                  </div>
                  <span className="text-xs font-semibold tracking-wide">{step.label}</span>
                </div>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Preview Container */}
        <div className="lg:col-span-8 bg-slate-950 rounded-2xl border border-slate-900/60 p-4 flex flex-col items-center justify-center min-h-[500px]">
          {displayImageUrl ? (
            <div className="relative inline-block select-none overflow-hidden max-w-full rounded-lg shadow-2xl border border-slate-900">
              <img
                ref={imageRef}
                src={displayImageUrl}
                alt="Manga Page Preview"
                onLoad={updateDimensions}
                className="max-h-[75vh] w-auto max-w-full object-contain block"
              />

              {/* Absolute Overlay Boxes */}
              {renderedDims && naturalDims && boxes.map((box, index) => {
                const scaleX = renderedDims.width / naturalDims.width;
                const scaleY = renderedDims.height / naturalDims.height;

                const left = box.x1 * scaleX;
                const top = box.y1 * scaleY;
                const width = (box.x2 - box.x1) * scaleX;
                const height = (box.y2 - box.y1) * scaleY;

                return (
                  <div
                    key={index}
                    style={{
                      position: 'absolute',
                      left: `${left}px`,
                      top: `${top}px`,
                      width: `${width}px`,
                      height: `${height}px`,
                    }}
                    className="absolute z-10 flex items-center justify-center pointer-events-none"
                  >
                    {processingState === 'done' ? (
                      <div
                        style={{
                          fontSize: `${Math.max(8, Math.min(height * 0.45, 16))}px`,
                          lineHeight: '1.2',
                        }}
                        className="text-black font-semibold text-center bg-white/95 px-1.5 py-0.5 rounded shadow-lg border border-black/20 select-text select-all"
                      >
                        {translations[index] || '...'}
                      </div>
                    ) : (
                      <div className="w-full h-full bg-indigo-500/10 backdrop-blur-[1px] border border-dashed border-indigo-400/60 animate-pulse rounded flex items-center justify-center">
                        <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest bg-slate-950/80 px-1 rounded scale-75 md:scale-100">
                          OCR
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 flex flex-col items-center gap-4 text-slate-600">
              <Upload className="w-16 h-16 stroke-1 text-slate-800" />
              <p className="text-sm font-semibold tracking-wide">Manga page preview will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
