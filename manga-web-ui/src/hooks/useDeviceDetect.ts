import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if the client viewport is mobile/tablet portrait (<768px)
 * or if it is a device using touch input.
 */
export function useDeviceDetect() {
  const [isMobileOrTouch, setIsMobileOrTouch] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      const isMobileWidth = window.innerWidth < 768;
      const isTouchDevice =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

      setIsMobileOrTouch(isMobileWidth || isTouchDevice);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    
    return () => {
      window.removeEventListener('resize', checkDevice);
    };
  }, []);

  return isMobileOrTouch;
}
