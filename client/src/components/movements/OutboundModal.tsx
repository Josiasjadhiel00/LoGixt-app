import React, { useState, useEffect } from 'react';
import { ArrowUpRight, X, AlertCircle, CheckCircle2, Search, Barcode, MapPin, AlertTriangle } from 'lucide-react';
import { Product } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

interface OutboundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialProduct?: Product | null;
  onOpenScanner?: () => void;
}

export const OutboundModal: React.FC<OutboundModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialProduct,
  onOpenScanner,
}) => {
  const [product, setProduct] = useState<Product | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [destino, setDestino] = useState('');
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (initialProduct) {
      setProduct(initialProduct);
    } else {
      setProduct(null);
    }
    setCantidad('1');
    setDestino('');
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
  const newStock = currentStock - parsedQty;
  const isInsufficient = parsedQty > currentStock;
  const isOutOfStock = currentStock <= 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) {
      setError('Debe seleccionar un producto para despachar.');
      return;
    }

    if (isOutOfStock) {
      setError('No es posible despachar un producto sin existencias.');
      return;
    }

    if (parsedQty <= 0) {
      setError('La cantidad a despachar debe ser mayor a cero.');
      return;
    }

    if (isInsufficient) {
      setError(`Stock insuficiente. Solo quedan ${currentStock} unidades disponibles.`);
      return;
    }

    if (!destino.trim()) {
      setError('El destino o motivo de salida es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.movements.outbound({
        producto_id: product.id,
        cantidad: parsedQty,
        destino: destino || undefined,
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
        setError('Error al procesar el despacho.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const setExactQty = (amt: number) => {
    setCantidad(String(Math.min(currentStock, amt)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#0b1226] text-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#070e22] border-b border-slate-800 text-white">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-950/80 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-lg text-white">Registrar Despacho / Salida</h3>
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

          {/* Búsqueda o Escaneo si no hay producto */}
          {!product ? (
            <div className="space-y-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Escanear o Buscar Producto a Despachar
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
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none font-mono"
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
                    className="px-3.5 py-2 text-xs font-bold bg-sky-950 text-sky-400 border border-sky-500/30 hover:bg-sky-900 rounded-xl flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    <Barcode className="w-4 h-4" />
                    <span className="hidden sm:inline">Cámara</span>
                  </button>
                )}
              </div>
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
                    <MapPin className="w-3.5 h-3.5 text-sky-400" />
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
                  Cambiar
                </button>
              </div>

              {/* Advertencia si está agotado */}
              {isOutOfStock ? (
                <div className="p-3.5 bg-rose-950/60 border border-rose-500/40 text-rose-300 rounded-xl flex items-center space-x-2.5 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>PRODUCTO AGOTADO: No hay existencias disponibles para despacho.</span>
                </div>
              ) : (
                /* Comparador de Stock en Vivo */
                <div className="grid grid-cols-3 gap-2.5 p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 text-center">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Disponible</span>
                    <span className="text-lg font-black text-slate-200">
                      {currentStock} <span className="text-xs font-normal text-slate-400">{product.unidad_medida}</span>
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-xs font-bold text-sky-400">- Despacho</span>
                    <span className="text-lg font-black text-sky-400">-{parsedQty}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Stock Resultante</span>
                    <span
                      className={`text-lg font-black ${
                        isInsufficient ? 'text-rose-400' : 'text-slate-200'
                      }`}
                    >
                      {newStock} <span className="text-xs font-normal text-slate-400">{product.unidad_medida}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cantidad y Destino */}
          {product && !isOutOfStock && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                    Cantidad a Despachar ({product.unidad_medida}) *
                  </label>
                  <span className="text-xs text-slate-400">Máx disponible: {currentStock}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="1"
                    max={currentStock}
                    required
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    className={`flex-1 px-4 py-2 text-lg font-black bg-slate-900 border rounded-xl text-white outline-none ${
                      isInsufficient
                        ? 'border-rose-500 focus:border-rose-400'
                        : 'border-slate-800 focus:border-sky-500'
                    }`}
                  />
                  {/* Botones rápidos */}
                  <div className="flex space-x-1.5">
                    <button
                      type="button"
                      onClick={() => setExactQty(1)}
                      className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      1
                    </button>
                    {currentStock >= 5 && (
                      <button
                        type="button"
                        onClick={() => setExactQty(5)}
                        className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        5
                      </button>
                    )}
                    {currentStock >= 10 && (
                      <button
                        type="button"
                        onClick={() => setExactQty(10)}
                        className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        10
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExactQty(currentStock)}
                      className="px-2.5 py-2 bg-sky-950 hover:bg-sky-900 border border-sky-500/40 text-sky-300 rounded-xl text-xs font-bold transition cursor-pointer"
                      title="Despachar todo el stock disponible"
                    >
                      Todo
                    </button>
                  </div>
                </div>
                {isInsufficient && (
                  <p className="text-xs text-rose-400 font-semibold mt-1">
                    ⚠️ La cantidad solicitada supera las existencias disponibles ({currentStock}).
                  </p>
                )}
              </div>

              {/* Destino y Observación */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block mb-1">
                    Destino / Área Solicitante *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Línea de Producción 2, Mantenimiento, Sucursal Centro"
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-sky-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block mb-1">
                    Observación / Responsable de Retiro (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Solicitado por Ing. Ramírez para orden de trabajo N° 102"
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-sky-500 outline-none"
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
                  disabled={isSubmitting || parsedQty <= 0 || isInsufficient || isOutOfStock}
                  className="px-6 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl flex items-center space-x-2 shadow-lg shadow-sky-950/50 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Confirmando...' : 'Confirmar Despacho'}</span>
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};