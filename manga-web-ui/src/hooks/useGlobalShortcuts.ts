import { useEffect, useRef } from 'react';
import { useToolStore } from '../store/useToolStore';
import { useCanvasStore } from '../store/useCanvasStore';
export const useGlobalShortcuts = () => {
  const previousToolRef = useRef<string | null>(null);
  const pressedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!e.key) return; // 🚀 VÁ LỖI CỐT LÕI

      const key = e.key.toLowerCase();
      const currentTool = useToolStore.getState().activeMode;

      if (key === 'control' || key === 'meta') {
        if (currentTool !== 'none') {
          previousToolRef.current = currentTool;
          pressedKeyRef.current = 'ctrl_or_meta'; 
          useToolStore.getState().setActiveMode('none');
        }
        return; 
      }
      if (key === 'backspace' || key === 'delete') {
        const canvasState = useCanvasStore.getState();
        // Kiểm tra xem có ô chữ nào đang được nhấp chọn không
        if (canvasState.activeBubbleId) {
          canvasState.removeBubble(canvasState.activeBubbleId); // Bắn bỏ ô chữ khỏi kho
          canvasState.setActiveBubble(null);                    // Reset lại trạng thái chọn
        }
        return; // Dừng lại không xét các phím tắt bên dưới nữa
      }

      if (key === '`' || key === '~') {
        useToolStore.getState().setIsComparing(true);
        return;
      }

      if (key === 't') {
        const toolState = useToolStore.getState();
        useCanvasStore.getState().addBubble({
          x: 200, y: 200, w: 200, h: 80,
          text: "Gõ chữ vào đây...",
          fontSize: toolState.fontSize || 40,
          fontColor: toolState.fontColor || '#000000',
          fontFamily: toolState.fontFamily || "'Comic Neue', cursive",
          rotation: 0
        });
        useToolStore.getState().setActiveMode('none');
        return;
      }

      const keyToToolMap: Record<string, any> = {
        'v': 'none', 'e': 'erase', 'b': 'restore', 's': 'scan', ' ': 'pan',
      };

      if (keyToToolMap[key] && currentTool !== keyToToolMap[key]) {
        previousToolRef.current = currentTool;
        pressedKeyRef.current = key;
        useToolStore.getState().setActiveMode(keyToToolMap[key]);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.key) return; // 🚀 VÁ LỖI TO LOWER CASE OF UNDEFINED TẠI ĐÂY
      const key = e.key.toLowerCase();
      if (key === '`' || key === '~') {
        useToolStore.getState().setIsComparing(false);
        return;
      }
      if ((key === 'control' || key === 'meta') && pressedKeyRef.current === 'ctrl_or_meta') {
        if (previousToolRef.current) {
          useToolStore.getState().setActiveMode(previousToolRef.current as any);
        }
        previousToolRef.current = null;
        pressedKeyRef.current = null;
        return;
      }

      if (key === pressedKeyRef.current && previousToolRef.current) {
        useToolStore.getState().setActiveMode(previousToolRef.current as any);
        previousToolRef.current = null;
        pressedKeyRef.current = null;
      }
    };

    const handleWindowBlur = () => {
      if (previousToolRef.current) {
        useToolStore.getState().setActiveMode(previousToolRef.current as any);
        previousToolRef.current = null;
        pressedKeyRef.current = null;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);
};