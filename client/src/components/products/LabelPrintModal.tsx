import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { Printer, X, MapPin, Tag } from 'lucide-react';
import { Product } from '../../types';

interface LabelPrintModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export const LabelPrintModal: React.FC<LabelPrintModalProps> = ({ product, isOpen, onClose }) => {
  const barcodeSvgRef = useRef<SVGSVGElement | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (!product || !isOpen) return;

    // Generar Código de Barras (usar código de barras existente o código interno)
    const barcodeValue = product.codigo_barras || product.codigo;
    if (barcodeSvgRef.current && barcodeValue) {
      try {
        JsBarcode(barcodeSvgRef.current, barcodeValue, {
          format: 'CODE128',
          lineColor: '#000000',
          width: 1.8,
          height: 48,
          displayValue: true,
          fontSize: 12,
          margin: 0,
        });
      } catch (err) {
        console.error('Error renderizando código de barras:', err);
      }
    }

    // Generar Código QR
    const qrValue = product.codigo_qr || product.codigo;
    QRCode.toDataURL(qrValue, { width: 140, margin: 1 })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Error renderizando QR:', err));
  }, [product, isOpen]);

  if (!isOpen || !product) return null;

  const handlePrint = () => {
    window.print();
  };

  const ubicacionCompleta = [
    product.ubicacion_almacen,
    product.ubicacion_pasillo,
    product.ubicacion_estante,
    product.ubicacion_nivel,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#0b1226] text-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-800">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4.5 bg-[#070e22] border-b border-slate-800 text-white">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Tag className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-lg text-white">Etiqueta de Almacén</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Area Preview */}
        <div className="p-6 bg-slate-950/70 flex justify-center border-b border-slate-800/80">
          <div
            id="printable-label"
            className="w-[360px] bg-white border-2 border-dashed border-slate-300 p-4 rounded-xl shadow-lg text-slate-900 font-sans"
          >
            {/* Encabezado de etiqueta */}
            <div className="border-b pb-2 mb-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-emerald-700 uppercase">
                  LOGÍSTICA INTERNA
                </span>
                <h4 className="text-sm font-black leading-tight line-clamp-2 mt-0.5">
                  {product.nombre}
                </h4>
              </div>
              <span className="text-xs bg-slate-100 font-mono font-bold px-2 py-1 rounded border">
                {product.codigo}
              </span>
            </div>

            {/* Códigos QR y de Barras */}
            <div className="flex items-center justify-between gap-3 my-2">
              {qrDataUrl && (
                <div className="flex flex-col items-center">
                  <img src={qrDataUrl} alt="QR" className="w-24 h-24 border rounded p-1 bg-white" />
                  <span className="text-[9px] text-slate-500 font-mono mt-0.5">QR Rápido</span>
                </div>
              )}

              <div className="flex-1 flex flex-col items-center justify-center">
                <svg ref={barcodeSvgRef} className="w-full max-h-16" />
                <span className="text-[9px] text-slate-500 font-mono mt-0.5">Lector Láser</span>
              </div>
            </div>

            {/* Ubicación física */}
            <div className="mt-3 pt-2 border-t flex items-center space-x-1.5 text-xs text-slate-700 bg-slate-50 p-2 rounded-lg">
              <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="font-semibold text-slate-500">Ubicación:</span>
              <span className="font-bold text-slate-900 truncate">
                {ubicacionCompleta || 'Sin ubicación asignada'}
              </span>
            </div>

            {/* Metadata adicional */}
            <div className="mt-2 flex justify-between text-[10px] text-slate-400 font-mono">
              <span>Unidad: {product.unidad_medida}</span>
              <span>Min: {product.stock_minimo}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#070e22] border-t border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Imprima esta etiqueta para pegarla en el estante o caja del producto.
          </p>
          <div className="flex space-x-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              Cerrar
            </button>
            <button
              onClick={handlePrint}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl flex items-center space-x-1.5 shadow-lg shadow-emerald-950/50 transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
