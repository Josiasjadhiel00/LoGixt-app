import { useEffect, useRef } from 'react';

interface BarcodeScannerOptions {
  onScan: (code: string) => void;
  minLength?: number;
  maxIntervalMs?: number;
  enabled?: boolean;
}

/**
 * Hook para detectar lecturas automáticas desde pistolas lectoras de código de barras USB/Bluetooth (Keyboard Wedge).
 * Las pistolas envían una ráfaga de teclas muy rápida (< 40ms entre caracteres) y terminan con Enter.
 */
export function useBarcodeScanner({
  onScan,
  minLength = 3,
  maxIntervalMs = 60,
  enabled = true,
}: BarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar teclas modificadoras
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;

      // Si el intervalo entre teclas es demasiado largo, reiniciar el buffer
      if (timeDiff > maxIntervalMs && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      lastKeyTimeRef.current = currentTime;

      // Al presionar Enter, verificar si el buffer contiene un código escaneado
      if (e.key === 'Enter') {
        const scannedCode = bufferRef.current.trim();
        if (scannedCode.length >= minLength) {
          e.preventDefault();
          onScan(scannedCode);
        }
        bufferRef.current = '';
        return;
      }

      // Acumular caracteres imprimibles
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onScan, minLength, maxIntervalMs, enabled]);
}
