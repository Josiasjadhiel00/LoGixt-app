import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, RefreshCw, AlertCircle } from 'lucide-react';
import { sound } from '../../services/sound';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
  title?: string;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  title = 'Escanear Código (QR o Barras)',
}) => {
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const elementId = 'wms-html5-camera-scanner';

  useEffect(() => {
    if (!isOpen) {
      if (scannerRef.current && isScanning) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
        setIsScanning(false);
      }
      return;
    }

    let isMounted = true;

    // Obtener lista de cámaras
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!isMounted) return;
        if (devices && devices.length > 0) {
          setCameras(devices);
          // Preferir cámara trasera si existe (común en tablets y móviles)
          const backCamera = devices.find((c) => /back|rear|trasera|environment/i.test(c.label));
          setSelectedCamera(backCamera ? backCamera.id : devices[0].id);
        } else {
          setErrorMsg('No se detectó ninguna cámara en este dispositivo.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setErrorMsg(`Error al acceder a la cámara: ${err.message || err}`);
      });

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedCamera) return;

    const html5QrCode = new Html5Qrcode(elementId);
    scannerRef.current = html5QrCode;

    const config = {
      fps: 15,
      qrbox: { width: 260, height: 260 },
      aspectRatio: 1.0,
    };

    html5QrCode
      .start(
        selectedCamera,
        config,
        (decodedText) => {
          sound.playSuccess();
          html5QrCode.stop().then(() => {
            html5QrCode.clear();
            setIsScanning(false);
            onScanSuccess(decodedText);
            onClose();
          }).catch(() => {
            onScanSuccess(decodedText);
            onClose();
          });
        },
        () => {
          // Frame sin código detectado
        }
      )
      .then(() => {
        setIsScanning(true);
        setErrorMsg(null);
      })
      .catch((err) => {
        setErrorMsg(`No se pudo iniciar el flujo de video: ${err.message || err}`);
        setIsScanning(false);
      });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
      }
    };
  }, [isOpen, selectedCamera]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#0b1226] text-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 bg-[#070e22] border-b border-slate-800 text-white">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Camera className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-lg text-white">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {errorMsg ? (
            <div className="p-4 bg-rose-950/60 border border-rose-500/40 rounded-2xl flex items-start space-x-3 text-rose-300">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
              <div>
                <p className="font-bold text-sm text-white">Error de Cámara</p>
                <p className="text-xs mt-1 text-rose-300/90">{errorMsg}</p>
                <p className="text-xs text-slate-400 mt-2">
                  Consejo: Verifique los permisos de cámara en su navegador o utilice el lector USB / entrada manual.
                </p>
              </div>
            </div>
          ) : (
            <div className="relative flex flex-col items-center">
              <div
                id={elementId}
                className="w-full max-w-sm rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-inner min-h-[300px]"
              />

              {/* Selector de cámara si hay más de una */}
              {cameras.length > 1 && (
                <div className="mt-4 flex items-center space-x-2 w-full">
                  <RefreshCw className="w-4 h-4 text-slate-400" />
                  <select
                    value={selectedCamera}
                    onChange={(e) => setSelectedCamera(e.target.value)}
                    className="text-xs bg-slate-900 border border-slate-800 text-white rounded-xl p-2.5 w-full focus:border-emerald-500 outline-none"
                  >
                    {cameras.map((cam) => (
                      <option key={cam.id} value={cam.id}>
                        {cam.label || `Cámara ${cam.id}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <p className="text-xs text-slate-400 text-center mt-3">
                Apunta la cámara hacia un código QR o código de barras del producto.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#070e22] border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
          >
            Cerrar Escáner
          </button>
        </div>
      </div>
    </div>
  );
};
