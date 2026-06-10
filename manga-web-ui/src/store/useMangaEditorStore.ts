import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TextBubble {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  japanese?: string;
  vietnamese?: string;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  rotation: number;
  sfxClass?: string;
  isHidden?: boolean;
  isLocked?: boolean;
  tailDirection?: 'none' | 'left' | 'right';
  isBold?: boolean;
  isItalic?: boolean;
  isUppercase?: boolean;
  outlineColor?: string;
  outlineWidth?: number;
  hasShadow?: boolean;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  rawBox?: { x1: number; y1: number; x2: number; y2: number };
  boxX?: number;
  boxY?: number;
  boxW?: number;
  boxH?: number;
  isRestored?: boolean;
}

export interface HistoryEntry {
  imageUrl: string | null;
  bubbles: TextBubble[];
}

export interface MangaEditorState {
  // Present State
  imageUrl: string | null;
  bubbles: TextBubble[];

  // History Stack
  past: HistoryEntry[];
  future: HistoryEntry[];

  // Concurrency & Race Condition Control
  stateVersion: number;
  isCapturingBlob: boolean;

  // Actions
  setImageUrl: (url: string | null) => void;
  setBubbles: (bubbles: TextBubble[]) => void;
  addBubble: (bubble: Omit<TextBubble, 'id'> & { id?: string }) => void;
  updateBubble: (id: string, data: Partial<TextBubble>) => void;
  removeBubble: (id: string) => void;

  // History & Undo/Redo Engine
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;

  // Async Canvas Capture
  saveCanvasImageState: (canvas: HTMLCanvasElement) => Promise<void>;

  // AI Operation Simulation
  callAITranslation: (canvas: HTMLCanvasElement) => Promise<void>;
}

const MAX_HISTORY_STEPS = 30;

export const useMangaEditorStore = create<MangaEditorState>()(
  persist(
    (set, get) => ({
      // Present State
      imageUrl: null,
      bubbles: [],

      // History Stack
      past: [],
      future: [],

      // Concurrency Controls
      stateVersion: 0,
      isCapturingBlob: false,

      setImageUrl: (url) => set({ imageUrl: url }),

      setBubbles: (bubbles) => set({ bubbles }),

      addBubble: (bubbleData) => {
        get().saveHistory();
        set((state) => ({
          bubbles: [
            ...state.bubbles,
            {
              ...bubbleData,
              id: bubbleData.id || `bubble_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            } as TextBubble,
          ],
        }));
      },

      updateBubble: (id, data) => {
        get().saveHistory();
        set((state) => ({
          bubbles: state.bubbles.map((b) => (b.id === id ? { ...b, ...data } : b)),
        }));
      },

      removeBubble: (id) => {
        get().saveHistory();
        set((state) => ({
          bubbles: state.bubbles.filter((b) => b.id !== id),
        }));
      },

      // History Saving Engine
      saveHistory: () => {
        const { imageUrl, bubbles, past, future, stateVersion } = get();

        // 1. Branch Invalidation: Revoke all Blob URLs in the future stack before clearing it
        future.forEach((entry) => {
          if (entry.imageUrl && entry.imageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(entry.imageUrl);
          }
        });

        const newPast = [...past];

        // 2. Truncation: Revoke the oldest past entry if history size limit is exceeded
        if (newPast.length >= MAX_HISTORY_STEPS) {
          const oldest = newPast.shift();
          if (oldest && oldest.imageUrl && oldest.imageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(oldest.imageUrl);
          }
        }

        // 3. Push present state to past stack
        newPast.push({ imageUrl, bubbles });

        set({
          past: newPast,
          future: [],
          stateVersion: stateVersion + 1,
        });
      },

      // Undo Engine
      undo: () => {
        const { past, future, imageUrl, bubbles, stateVersion } = get();
        if (past.length === 0) return;

        const newPast = [...past];
        const previous = newPast.pop()!;

        // Push current present state to future stack
        const newFuture = [{ imageUrl, bubbles }, ...future];

        set({
          past: newPast,
          imageUrl: previous.imageUrl,
          bubbles: previous.bubbles,
          future: newFuture,
          stateVersion: stateVersion + 1,
        });
      },

      // Redo Engine
      redo: () => {
        const { past, future, imageUrl, bubbles, stateVersion } = get();
        if (future.length === 0) return;

        const newFuture = [...future];
        const next = newFuture.shift()!;

        // Push current present state to past stack
        const newPast = [...past, { imageUrl, bubbles }];

        set({
          past: newPast,
          imageUrl: next.imageUrl,
          bubbles: next.bubbles,
          future: newFuture,
          stateVersion: stateVersion + 1,
        });
      },

      // Cleanup Engine
      clearHistory: () => {
        const { past, future, imageUrl } = get();

        // Revoke all past Blob URLs
        past.forEach((entry) => {
          if (entry.imageUrl && entry.imageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(entry.imageUrl);
          }
        });

        // Revoke all future Blob URLs
        future.forEach((entry) => {
          if (entry.imageUrl && entry.imageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(entry.imageUrl);
          }
        });

        // Revoke present Blob URL if any
        if (imageUrl && imageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(imageUrl);
        }

        set({
          past: [],
          future: [],
          imageUrl: null,
          bubbles: [],
          stateVersion: 0,
        });
      },

      // Async Canvas Capture with Micro-Race Condition Protection
      saveCanvasImageState: async (canvas: HTMLCanvasElement) => {
        if (get().isCapturingBlob) {
          console.warn('[Zustand Store] Concurrent blob capture blocked to prevent out-of-order states.');
          return;
        }

        set({ isCapturingBlob: true });

        try {
          const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/png');
          });

          if (!blob) {
            set({ isCapturingBlob: false });
            return;
          }

          const newUrl = URL.createObjectURL(blob);

          // Save previous state to history
          get().saveHistory();

          set({
            imageUrl: newUrl,
            isCapturingBlob: false,
          });
        } catch (error) {
          set({ isCapturingBlob: false });
          console.error('[Zustand Store] Failed to save canvas state as Blob URL:', error);
        }
      },

      // Concurrency Control (State Versioning for AI Tasks)
      callAITranslation: async (canvas: HTMLCanvasElement) => {
        const capturedVersion = get().stateVersion;
        console.log(`[Zustand Store] Starting AI operation with version key: ${capturedVersion}`);

        // Await 3 seconds mock API call
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Generate the new AI translation image blob from canvas
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, 'image/png');
        });

        if (!blob) {
          console.error('[Zustand Store] Failed to capture canvas blob for AI output.');
          return;
        }

        const newAIBlobUrl = URL.createObjectURL(blob);

        // Check for version mismatch
        if (get().stateVersion !== capturedVersion) {
          console.warn(
            `[Zustand Store] Version Mismatch! Captured: ${capturedVersion}, Present: ${get().stateVersion}. Revoking AI Blob URL immediately.`
          );
          URL.revokeObjectURL(newAIBlobUrl);
          return;
        }

        // Version matches! Save history and apply state
        get().saveHistory();
        set({
          imageUrl: newAIBlobUrl,
        });
        console.log(`[Zustand Store] AI operation successful. Saved state with version key: ${get().stateVersion}`);
      },
    }),
    {
      name: 'manga-editor-storage',
      // Omit history lists, transient version trackers, and any temporary Blob URL from persistence
      partialize: (state) => {
        const persistedImageUrl = state.imageUrl && state.imageUrl.startsWith('blob:') ? null : state.imageUrl;
        return {
          imageUrl: persistedImageUrl,
          bubbles: state.bubbles,
        };
      },
    }
  )
);
