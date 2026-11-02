import React, { useState, useEffect } from 'react';
import { ArrowDownLeft, X, AlertCircle, CheckCircle2, Search, Barcode, MapPin } from 'lucide-react';
import { Product } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

interface InboundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialProduct?: Product | null;
  onOpenScanner?: () => void;
}

export const InboundModal: React.FC<InboundModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialProduct,
  onOpenScanner,
}) => {
  const [product, setProduct] = useState<Product | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [observacion, setObservacion] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (initialProduct) {
      setProduct(initialProduct);
      setProveedor(initialProduct.proveedor || '');
    } else {
      setProduct(null);
      setProveedor('');
    }
    setCantidad('1');
    setObservacion('');
    setError(null);
    setSearchInput('');
  }, [initialProduct, isOpen]);

  if (!isOpen) return null;

  const handleLookup = async (codeToSearch?: string) => {
    const term = codeToSearch || searchInput;
    if (!term.trim()) return;

    setIsSearching(true);
    setError(null);
    try {
      const res = await api.products.lookup(term.trim());
      setProduct(res.product);
      setProveedor(res.product.proveedor || '');
      sound.playSuccess();
    } catch (err: unknown) {
      sound.playError();
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Producto no encontrado.');
      }
      setProduct(null);
    } finally {
      setIsSearching(false);
    }
  };

  const parsedQty = parseInt(cantidad, 10) || 0;
  const currentStock = product ? product.stock_actual : 0;
  const newStock = currentStock + parsedQty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) {
      setError('Debe seleccionar o escanear un producto válido.');
      return;
    }

    if (parsedQty <= 0) {
      setError('La cantidad a ingresar debe ser mayor a cero.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.movements.inbound({
        producto_id: product.id,
        cantidad: parsedQty,
        proveedor: proveedor || undefined,
        observacion: observacion || undefined,
      });

      sound.playSuccess();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      sound.playError();
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al procesar el ingreso de mercancía.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const addQty = (amount: number) => {
    setCantidad(String(Math.max(1, parsedQty + amount)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#0b1226] text-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#070e22] border-b border-slate-800 text-white">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-lg text-white">Registrar Ingreso de Mercancía</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4.5">
          {error && (
            <div className="p-3.5 bg-rose-950/60 border border-rose-500/40 rounded-xl flex items-center space-x-2.5 text-rose-300 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Búsqueda o Escaneo si no hay producto seleccionado */}
          {!product ? (
            <div className="space-y-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Escanear o Buscar Producto
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Código interno, código de barras o QR..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleLookup();
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none font-mono"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                </div>
                <button
                  type="button"
                  onClick={() => handleLookup()}
                  disabled={isSearching}
                  className="px-3.5 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition cursor-pointer"
                >
                  {isSearching ? 'Buscando...' : 'Buscar'}
                </button>
                {onOpenScanner && (
                  <button
                    type="button"
                    onClick={onOpenScanner}
                    className="px-3.5 py-2 text-xs font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-900 rounded-xl flex items-center space-x-1.5 transition cursor-pointer"
                    title="Abrir cámara escáner"
                  >
                    <Barcode className="w-4 h-4" />
                    <span className="hidden sm:inline">Cámara</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                💡 Consejo: Si usa lector láser USB, apunte y dispare al código de barras del producto.
              </p>
            </div>
          ) : (
            /* Ficha del Producto Seleccionado */
            <div className="p-4.5 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-3.5">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold bg-slate-950 text-purple-300 border border-slate-800 px-2 py-0.5 rounded-lg">
                    {product.codigo}
                  </span>
                  <h4 className="font-bold text-white text-base mt-1.5">{product.nombre}</h4>
                  <div className="flex items-center space-x-1.5 text-xs text-slate-400 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {[product.ubicacion_almacen, product.ubicacion_pasillo, product.ubicacion_estante]
                        .filter(Boolean)
                        .join(' • ') || 'Sin ubicación'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProduct(null)}
                  className="text-xs text-slate-400 hover:text-rose-400 underline cursor-pointer"
                >
                  Cambiar producto
                </button>
              </div>

              {/* Comparador de Stock en Vivo */}
              <div className="grid grid-cols-3 gap-2.5 p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 text-center">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Stock Actual</span>
                  <span className="text-lg font-black text-slate-200">
                    {currentStock} <span className="text-xs font-normal text-slate-400">{product.unidad_medida}</span>
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-emerald-400">+ Ingreso</span>
                  <span className="text-lg font-black text-emerald-400">+{parsedQty}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block">Nuevo Stock</span>
                  <span className="text-lg font-black text-emerald-300">
                    {newStock} <span className="text-xs font-normal text-slate-400">{product.unidad_medida}</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Selector de Cantidad */}
          {product && (
            <>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Cantidad Recibida ({product.unidad_medida}) *
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="1"
                    required
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    className="flex-1 px-4 py-2 text-lg font-black bg-slate-900 border border-slate-800 rounded-xl text-white focus:border-emerald-500 outline-none"
                  />
                  {/* Botones de incremento rápido */}
                  <div className="flex space-x-1.5">
                    {[1, 5, 10, 50].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => addQty(amt)}
                        className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        +{amt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Proveedor y Observación */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block mb-1">
                    Proveedor / Remitente (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Distribuidora Central S.A."
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block mb-1">
                    Observación / Referencia de Compra (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Guía de remisión N° 45892 o lote 2026-B"
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Botón de Confirmación */}
              <div className="pt-2 flex justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || parsedQty <= 0}
                  className="px-6 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl flex items-center space-x-2 shadow-lg shadow-emerald-950/50 transition cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Confirmando...' : 'Confirmar Ingreso'}</span>
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};