import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Barcode,
  Camera,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  MapPin,
  Package,
  X,
  Building,
  UserCheck,
  FileText,
  History
} from 'lucide-react';
import { Product, Movement } from '../types';
import { api } from '../services/api';
import { sound } from '../services/sound';

interface DespachoViewProps {
  onGoBack: () => void;
  onOpenScannerCamera: () => void;
  onSuccessMutation: () => void;
  initialProduct?: Product | null;
}

export const DespachoView: React.FC<DespachoViewProps> = ({
  onGoBack,
  onOpenScannerCamera,
  onSuccessMutation,
  initialProduct,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [product, setProduct] = useState<Product | null>(initialProduct || null);
  const [cantidad, setCantidad] = useState('1');
  const [destino, setDestino] = useState('');
  const [responsableRecepcion, setResponsableRecepcion] = useState('');
  const [guiaDespacho, setGuiaDespacho] = useState('');
  const [observacion, setObservacion] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Historial de últimos despachos
  const [recentOutbounds, setRecentOutbounds] = useState<Movement[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  useEffect(() => {
    if (initialProduct) {
      setProduct(initialProduct);
    }
    searchInputRef.current?.focus();
    loadRecentOutbounds();
  }, [initialProduct]);

  const loadRecentOutbounds = async () => {
    setLoadingRecent(true);
    try {
      const res = await api.movements.getAll({ tipo: 'DESPACHO', limit: 8 });
      setRecentOutbounds(res.movements);
    } catch (err) {
      console.error('Error cargando despachos recientes:', err);
    } finally {
      setLoadingRecent(false);
    }
  };

  const handleLookup = async (codeToSearch?: string) => {
    const term = (codeToSearch || searchInput).trim();
    if (!term) return;

    setIsSearching(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.products.lookup(term);
      setProduct(res.product);
      sound.playSuccess();
      setSearchInput('');
    } catch (err: unknown) {
      sound.playError();
      setProduct(null);
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(`No se encontró producto para el código: "${term}"`);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const parsedQty = parseInt(cantidad, 10) || 0;
  const currentStock = product ? product.stock_actual : 0;
  const isOutOfStock = currentStock === 0;
  const isInsufficient = parsedQty > currentStock;
  const remainingStock = Math.max(0, currentStock - parsedQty);

  const handleConfirmOutbound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) {
      setErrorMessage('Identifique o escanee un producto primero.');
      return;
    }

    if (parsedQty <= 0) {
      setErrorMessage('La cantidad a despachar debe ser mayor a 0.');
      return;
    }

    if (isInsufficient) {
      sound.playError();
      setErrorMessage(
        `Operación rechazada: La cantidad a despachar (${parsedQty}) supera las existencias disponibles (${currentStock}).`
      );
      return;
    }

    if (!destino.trim()) {
      setErrorMessage('Debe indicar el área o destino solicitante.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const movementResult = await api.movements.outbound({
        producto_id: product.id,
        cantidad: parsedQty,
        destino: destino.trim(),
        responsable_recepcion: responsableRecepcion.trim() || undefined,
        guia_despacho: guiaDespacho.trim() || undefined,
        observacion: observacion.trim() || undefined,
      });
      const resultingStock = movementResult.stock_nuevo ?? remainingStock;

      sound.playSuccess();
      setSuccessMessage(
        movementResult.queued
          ? `Despacho guardado localmente y pendiente de sincronización: ${parsedQty} ${product.unidad_medida} de "${product.nombre}". Stock local: ${resultingStock}.`
          : `Despacho confirmado con éxito: Se despacharon ${parsedQty} ${product.unidad_medida} de "${product.nombre}". Stock restante: ${resultingStock}.`
      );

      // Actualizar estado local del producto
      setProduct({
        ...product,
        stock_actual: resultingStock,
      });

      setCantidad('1');
      setDestino('');
      setResponsableRecepcion('');
      setGuiaDespacho('');
      setObservacion('');
      loadRecentOutbounds();
      onSuccessMutation();

      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
    } catch (err: unknown) {
      sound.playError();
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Error al procesar el despacho.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full py-4 sm:py-6 px-4 sm:px-6">
      {/* Barra de Navegación Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <button
            onClick={onGoBack}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-300 transition group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform text-sky-400" />
            <span>Centro de Operaciones</span>
          </button>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-sky-400 block">
              ÁREA DE SALIDA Y ENTREGAS
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide">
              📤 Despacho de Mercancía
            </h1>
          </div>
        </div>
      </div>

      {/* Contenido en 2 Columnas (media_1788804079091.png) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUMNA IZQUIERDA: Formulario e Identificación (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Mensajes de Éxito / Error */}
          {successMessage && (
            <div className="p-4 bg-sky-950/80 border border-sky-500/50 rounded-2xl flex items-center space-x-3 text-sky-300 text-sm shadow-lg animate-fade-in">
              <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
              <div className="flex-1 font-semibold">{successMessage}</div>
              <button
                onClick={() => setSuccessMessage(null)}
                className="text-sky-400 hover:text-sky-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="p-4 bg-red-950/80 border border-red-500/50 rounded-2xl flex items-center space-x-3 text-red-300 text-sm shadow-lg animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <div className="flex-1 font-semibold">{errorMessage}</div>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-red-400 hover:text-red-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* SECCIÓN 1: SELECCIONAR PRODUCTO */}
          <div className="bg-[#0b1226] border border-[#172547] rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center space-x-2">
                <span>1. SELECCIONAR PRODUCTO</span>
              </label>
              <span className="text-[11px] text-slate-400">Pistola USB · Teclado · Cámara</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Escanea con pistola USB o escribe código interno / barras / QR..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleLookup();
                    }
                  }}
                  className="w-full pl-10 pr-4 py-3.5 bg-[#070e22] border-2 border-slate-800 rounded-2xl text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500 transition text-sm font-bold"
                />
                <Barcode className="w-5 h-5 text-slate-500 absolute left-3.5 top-4" />
              </div>

              <button
                type="button"
                onClick={() => handleLookup()}
                disabled={isSearching}
                className="px-5 py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl text-xs transition cursor-pointer"
              >
                {isSearching ? 'Buscando...' : 'Identificar'}
              </button>

              <button
                type="button"
                onClick={onOpenScannerCamera}
                className="px-4 py-3.5 bg-sky-950 hover:bg-sky-900/80 border border-sky-500/40 text-sky-400 font-bold rounded-2xl text-xs flex items-center justify-center space-x-2 transition cursor-pointer"
                title="Escanear con la cámara del dispositivo"
              >
                <Camera className="w-4 h-4" />
                <span>Cámara</span>
              </button>
            </div>

            {/* Ficha Visual del Producto */}
            {product ? (
              <div className="p-4 bg-[#080f24] rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-3">
                <div className="flex items-start space-x-3.5">
                  {product.imagen ? (
                    <img
                      src={product.imagen}
                      alt={product.nombre}
                      className="w-14 h-14 rounded-xl object-cover border border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-[#0f2347] border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                      <Package className="w-7 h-7" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-slate-800 text-sky-400 border border-slate-700">
                        {product.codigo}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        {product.categoria_nombre || 'Sin categoría'}
                      </span>
                    </div>
                    <h3 className="text-base font-black text-white mt-1 leading-snug">
                      {product.nombre}
                    </h3>
                    <div className="flex items-center space-x-2 text-xs text-slate-400 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>
                        {[product.ubicacion_almacen, product.ubicacion_pasillo, product.ubicacion_estante, product.ubicacion_nivel]
                          .filter(Boolean)
                          .join(' • ') || 'Sin ubicación física'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-center sm:text-right shrink-0">
                  {isOutOfStock ? (
                    <div className="p-3 bg-red-950/80 border border-red-500/50 rounded-xl text-red-300 text-xs font-black">
                      <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-red-400" />
                      AGOTADO (0 {product.unidad_medida})
                    </div>
                  ) : (
                    <div className="p-3 bg-[#08152e] rounded-xl border border-sky-500/30 min-w-[130px]">
                      <span className="text-[10px] uppercase font-black tracking-wider text-sky-400 block">
                        STOCK DISPONIBLE
                      </span>
                      <span className="text-2xl font-black text-white">
                        {product.stock_actual}
                      </span>{' '}
                      <span className="text-xs text-sky-300 font-medium">{product.unidad_medida}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-[#080f24]/50 rounded-2xl border border-dashed border-slate-800 text-center py-6 text-slate-500 text-xs">
                <Package className="w-8 h-8 mx-auto text-slate-600 mb-1.5 opacity-50" />
                Escanee o identifique un producto para configurar la salida de almacén.
              </div>
            )}
          </div>

          {/* SECCIÓN 2: PARÁMETROS DE DESPACHO */}
          {product && !isOutOfStock && (
            <div className="bg-[#0b1226] border border-[#172547] rounded-3xl p-6 sm:p-7 shadow-xl space-y-5 animate-fade-in">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center space-x-2">
                  <span>2. PARÁMETROS DE DESPACHO</span>
                </label>
                <span className="text-xs font-mono text-slate-400">
                  Máximo disponible: <strong className="text-white">{currentStock} {product.unidad_medida}</strong>
                </span>
              </div>

              <form onSubmit={handleConfirmOutbound} className="space-y-5">
                {/* 3 COMPARADOR DE EXISTENCIAS (SECCIÓN 7) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-[#080f24] rounded-2xl border border-slate-800 text-center">
                  {/* 1. STOCK DISPONIBLE */}
                  <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800">
                    <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block mb-1">
                      STOCK DISPONIBLE
                    </span>
                    <span className="text-2xl font-black text-slate-100">
                      {currentStock}
                    </span>{' '}
                    <span className="text-xs text-slate-400 font-medium">{product.unidad_medida}</span>
                  </div>

                  {/* 2. CANTIDAD A DESPACHAR */}
                  <div className="p-3 bg-sky-950/50 rounded-xl border border-sky-500/40">
                    <span className="text-[10px] uppercase font-black tracking-wider text-sky-400 block mb-1">
                      A DESPACHAR
                    </span>
                    <span className="text-2xl font-black text-sky-400">
                      -{parsedQty}
                    </span>{' '}
                    <span className="text-xs text-sky-400/80 font-medium">{product.unidad_medida}</span>
                  </div>

                  {/* 3. STOCK RESTANTE */}
                  <div
                    className={`p-3 rounded-xl border ${
                      isInsufficient
                        ? 'bg-red-950/50 border-red-500/50'
                        : 'bg-slate-900/70 border-slate-800'
                    }`}
                  >
                    <span
                      className={`text-[10px] uppercase font-black tracking-wider block mb-1 ${
                        isInsufficient ? 'text-red-400' : 'text-slate-400'
                      }`}
                    >
                      STOCK RESTANTE
                    </span>
                    <span
                      className={`text-2xl font-black ${
                        isInsufficient ? 'text-red-400' : 'text-slate-100'
                      }`}
                    >
                      {remainingStock}
                    </span>{' '}
                    <span className="text-xs text-slate-400 font-medium">{product.unidad_medida}</span>
                  </div>
                </div>

                {isInsufficient && (
                  <div className="p-3.5 bg-red-950/80 border border-red-500/50 rounded-2xl text-red-300 text-xs font-semibold flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>
                      La cantidad solicitada ({parsedQty}) excede el stock físico disponible ({currentStock}).
                    </span>
                  </div>
                )}

                {/* Cantidad Input + Botones Rápidos */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                    Cantidad a Despachar ({product.unidad_medida}) *
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="number"
                      min="1"
                      max={currentStock}
                      required
                      value={cantidad}
                      onChange={(e) => setCantidad(e.target.value)}
                      className={`flex-1 px-4 py-3 text-3xl font-black bg-[#070e22] border-2 rounded-2xl text-white focus:outline-none transition ${
                        isInsufficient
                          ? 'border-red-500 text-red-400 focus:border-red-500'
                          : 'border-slate-800 focus:border-sky-500'
                      }`}
                    />

                    {/* Botones rápidos */}
                    <div className="flex space-x-1.5">
                      {[1, 5, 10].map((amt) => {
                        if (currentStock < amt) return null;
                        return (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setCantidad(String(amt))}
                            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer"
                          >
                            {amt}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setCantidad(String(currentStock))}
                        className="px-3.5 py-2 bg-sky-950 hover:bg-sky-900 border border-sky-500/40 text-sky-300 font-bold rounded-xl text-xs transition cursor-pointer"
                        title="Despachar la totalidad"
                      >
                        Todo ({currentStock})
                      </button>
                    </div>
                  </div>
                </div>

                {/* Área / Destino y Responsable */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Área o Destino Solicitante *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="Ej. Producción - Línea 2"
                        value={destino}
                        onChange={(e) => setDestino(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-[#070e22] border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500 font-medium"
                      />
                      <Building className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Responsable de Recepción
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Ej. Carlos Mendoza — Operaciones"
                        value={responsableRecepcion}
                        onChange={(e) => setResponsableRecepcion(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-[#070e22] border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500"
                      />
                      <UserCheck className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    </div>
                  </div>
                </div>

                {/* Nº Vale y Observación */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Nº Vale / Orden de Despacho
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Ej. ORD-2024-0089"
                        value={guiaDespacho}
                        onChange={(e) => setGuiaDespacho(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-[#070e22] border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500"
                      />
                      <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Observación (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Para mantenimiento preventivo de motores"
                      value={observacion}
                      onChange={(e) => setObservacion(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#070e22] border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {/* Botón Principal: CONFIRMAR DESPACHO */}
                <button
                  type="submit"
                  disabled={isSubmitting || parsedQty <= 0 || isInsufficient || isOutOfStock}
                  className="w-full py-4 bg-sky-600 hover:bg-sky-500 text-white font-black text-sm uppercase tracking-wider rounded-2xl flex items-center justify-center space-x-2 shadow-xl shadow-sky-950/60 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ArrowUp className="w-5 h-5" />
                  <span>{isSubmitting ? 'PROCESANDO SALIDA...' : 'CONFIRMAR DESPACHO'}</span>
                </button>
              </form>
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: ÚLTIMOS DESPACHOS REGISTRADOS (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#0b1226] border border-[#172547] rounded-3xl p-5 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-sky-950/80 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <History className="w-4 h-4" />
                </div>
                <h2 className="text-xs font-black uppercase tracking-wider text-white">
                  ÚLTIMOS DESPACHOS REGISTRADOS
                </h2>
              </div>
              <span className="text-[10px] font-mono text-slate-500">En tiempo real</span>
            </div>

            {loadingRecent ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                Cargando despachos recientes...
              </div>
            ) : recentOutbounds.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                <ArrowUp className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
                No se han registrado salidas hoy.
              </div>
            ) : (
              <div className="space-y-3">
                {recentOutbounds.map((mov) => (
                  <div
                    key={mov.id}
                    className="p-3.5 bg-[#080f24] hover:bg-[#0c1636] border border-slate-800/80 rounded-2xl flex items-center justify-between transition group"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="w-9 h-9 rounded-xl bg-sky-950/90 border border-sky-500/40 text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
                        <ArrowUp className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-[10px] font-bold text-slate-400">
                            {mov.producto_codigo}
                          </span>
                          {mov.destino && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-sky-300 font-semibold">
                              {mov.destino}
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-white group-hover:text-sky-300 transition truncate max-w-[180px]">
                          {mov.producto_nombre}
                        </h4>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {mov.responsable_recepcion ? `Recibe: ${mov.responsable_recepcion} · ` : ''}
                          {mov.fecha} {mov.hora.slice(0, 5)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-black text-sky-400">
                        -{mov.cantidad}
                      </span>{' '}
                      <span className="text-[10px] text-slate-400 block font-medium">
                        {mov.unidad_medida || 'UNID'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
