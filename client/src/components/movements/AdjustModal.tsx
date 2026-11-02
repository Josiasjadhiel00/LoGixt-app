import React, { useState, useEffect } from 'react';
import { Scale, X, AlertCircle, CheckCircle2, Search, Barcode, MapPin } from 'lucide-react';
import { Product } from '../../types';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

interface AdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialProduct?: Product | null;
  onOpenScanner?: () => void;
}

const MOTIVOS_AJUSTE = [
  'Conteo cíclico / Inventario físico',
  'Mercancía dañada / Merma',
  'Pérdida / Extravío detectado',
  'Error en despacho anterior',
  'Error en recepción anterior',
  'Muestra comercial / Donación',
  'Ajuste por vencimiento',
  'Otro motivo justificado',
];

export const AdjustModal: React.FC<AdjustModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialProduct,
  onOpenScanner,
}) => {
  const [product, setProduct] = useState<Product | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [nuevoStock, setNuevoStock] = useState('0');
  const [motivoAjuste, setMotivoAjuste] = useState(MOTIVOS_AJUSTE[0]);
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (initialProduct) {
      setProduct(initialProduct);
      setNuevoStock(String(initialProduct.stock_actual));
    } else {
      setProduct(null);
      setNuevoStock('0');
    }
    setMotivoAjuste(MOTIVOS_AJUSTE[0]);
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
      setNuevoStock(String(res.product.stock_actual));
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

  const currentStock = product ? product.stock_actual : 0;
  const parsedNewStock = parseInt(nuevoStock, 10);
  const diferencia = isNaN(parsedNewStock) ? 0 : parsedNewStock - currentStock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) {
      setError('Debe seleccionar un producto.');
      return;
    }

    if (isNaN(parsedNewStock) || parsedNewStock < 0) {
      setError('El nuevo stock debe ser un número entero mayor o igual a cero.');
      return;
    }

    if (diferencia === 0) {
      setError('El stock ingresado es idéntico al actual. No hay ajuste que aplicar.');
      return;
    }

    if (!motivoAjuste) {
      setError('El motivo del ajuste es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.movements.adjust({
        producto_id: product.id,
        stock_nuevo: parsedNewStock,
        motivo_ajuste: motivoAjuste,
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
        setError('Error al procesar el ajuste de inventario.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-[#0b1226] text-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#070e22] border-b border-slate-800 text-white">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-950/80 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Scale className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-lg text-white">Ajuste Manual de Inventario</h3>
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

          {/* Selector si no hay producto */}
          {!product ? (
            <div className="space-y-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Escanear o Buscar Producto a Ajustar
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
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none font-mono"
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
                    className="px-3.5 py-2 text-xs font-bold bg-amber-950 text-amber-400 border border-amber-500/30 hover:bg-amber-900 rounded-xl flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    <Barcode className="w-4 h-4" />
                    <span className="hidden sm:inline">Cámara</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Ficha y Cálculo de Diferencia */
            <div className="p-4.5 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-3.5">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold bg-slate-950 text-purple-300 border border-slate-800 px-2 py-0.5 rounded-lg">
                    {product.codigo}
                  </span>
                  <h4 className="font-bold text-white text-base mt-1.5">{product.nombre}</h4>
                  <div className="flex items-center space-x-1.5 text-xs text-slate-400 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
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

              {/* Comparador de Stock en Vivo */}
              <div className="grid grid-cols-3 gap-2.5 p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 text-center">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Registrado</span>
                  <span className="text-lg font-black text-slate-200">
                    {currentStock} <span className="text-xs font-normal text-slate-400">{product.unidad_medida}</span>
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-400 block">Diferencia</span>
                  <span
                    className={`text-lg font-black ${
                      diferencia > 0
                        ? 'text-emerald-400'
                        : diferencia < 0
                        ? 'text-rose-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {diferencia > 0 ? `+${diferencia}` : diferencia}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Nuevo Real</span>
                  <span className="text-lg font-black text-white">
                    {isNaN(parsedNewStock) ? '-' : parsedNewStock}{' '}
                    <span className="text-xs font-normal text-slate-400">{product.unidad_medida}</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Formulario de Ajuste */}
          {product && (
            <>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Cantidad Física Real / Conteo Nuevo ({product.unidad_medida}) *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={nuevoStock}
                  onChange={(e) => setNuevoStock(e.target.value)}
                  className="w-full px-4 py-2 text-lg font-black bg-slate-900 border border-slate-800 rounded-xl text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Motivo Justificado del Ajuste *
                </label>
                <select
                  value={motivoAjuste}
                  onChange={(e) => setMotivoAjuste(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white focus:border-amber-500 outline-none font-medium"
                >
                  {MOTIVOS_AJUSTE.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Observaciones Detalladas / Justificación (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalles sobre por qué se produjo la discrepancia o daño..."
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-amber-500 outline-none resize-none"
                />
              </div>

              {/* Botones */}
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
                  disabled={isSubmitting || diferencia === 0 || isNaN(parsedNewStock)}
                  className="px-6 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl flex items-center space-x-2 shadow-lg shadow-amber-950/50 transition cursor-pointer disabled:opacity-40"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Aplicando...' : 'Aplicar Ajuste'}</span>
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};