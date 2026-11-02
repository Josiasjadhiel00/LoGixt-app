import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  Barcode,
  Search,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  Printer,
  History,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Camera,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { Product, Movement } from '../types';
import { api } from '../services/api';
import { sound } from '../services/sound';
import { useAuth } from '../context/AuthContext';

interface ScannerPageProps {
  onOpenInbound: (product: Product) => void;
  onOpenOutbound: (product: Product) => void;
  onOpenAdjust: (product: Product) => void;
  onOpenLabel: (product: Product) => void;
  onOpenHistory: (product: Product) => void;
  onLaunchCamera: () => void;
  scannedCodeFromCamera?: string | null;
  onClearScannedCameraCode?: () => void;
}

export const ScannerPage: React.FC<ScannerPageProps> = ({
  onOpenInbound,
  onOpenOutbound,
  onOpenAdjust,
  onOpenLabel,
  onOpenHistory,
  onLaunchCamera,
  scannedCodeFromCamera,
  onClearScannedCameraCode,
}) => {
  const { isAdmin } = useAuth();
  const [inputCode, setInputCode] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Mantener el autofocus permanente para pistolas láser
  useEffect(() => {
    inputRef.current?.focus();
  }, [product]);

  // Si llega un código desde la cámara del dispositivo móvil o webcam
  useEffect(() => {
    if (scannedCodeFromCamera) {
      setInputCode(scannedCodeFromCamera);
      handleSearch(scannedCodeFromCamera);
      if (onClearScannedCameraCode) {
        onClearScannedCameraCode();
      }
    }
  }, [scannedCodeFromCamera]);

  const handleSearch = async (codeToSearch?: string) => {
    const code = (codeToSearch || inputCode).trim();
    if (!code) return;

    setIsLoading(true);
    setError(null);
    setProduct(null);
    setMovements([]);

    try {
      const res = await api.products.lookup(code);
      setProduct(res.product);
      sound.playSuccess();

      // Cargar los últimos 5 movimientos del producto escaneado
      const movRes = await api.movements.getAll({ producto_id: res.product.id });
      setMovements(movRes.movements.slice(0, 5));
    } catch (err: unknown) {
      sound.playError();
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('No se encontró ningún producto con este código.');
      }
    } finally {
      setIsLoading(false);
      // Limpiar el input para el próximo escaneo continuo con lector USB
      setInputCode('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-fadeIn">
      {/* Título */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center space-x-2">
            <QrCode className="w-7 h-7 text-emerald-400" />
            <span>Escáner de Códigos de Almacén</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Identificación inmediata mediante pistola USB/Bluetooth o cámara web/móvil.
          </p>
        </div>

        <button
          onClick={onLaunchCamera}
          className="px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl flex items-center space-x-2 shadow-lg shadow-emerald-950/50 transition self-start cursor-pointer"
        >
          <Camera className="w-4 h-4" />
          <span>Activar Cámara del Dispositivo</span>
        </button>
      </div>

      {/* Input de Escaneo Ultrarrápido con Autofocus */}
      <div className="bg-[#0b1226] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-3">
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <label className="block text-[11px] font-black uppercase tracking-wider text-slate-300">
            Escaneo en Vivo / Entrada Rápida de Código
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                autoFocus
                placeholder="Apunta tu lector láser o escribe código interno / barras / QR..."
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                className="w-full pl-10 pr-4 py-3 text-base font-mono font-bold bg-slate-900 border-2 border-slate-800 rounded-2xl text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 outline-none transition"
              />
              <Barcode className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
            </div>
            <button
              type="submit"
              disabled={isLoading || !inputCode.trim()}
              className="px-6 py-3 text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-2xl shadow-lg shadow-blue-950/50 transition cursor-pointer disabled:opacity-40"
            >
              {isLoading ? 'Consultando...' : 'Consultar'}
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 pt-1 gap-1">
            <span>⚡ Modo continuo activo: El cursor se mantiene siempre listo para el siguiente escaneo.</span>
            <span className="font-mono text-purple-400">Teclas: [Enter] para buscar</span>
          </div>
        </form>

        {error && (
          <div className="mt-3 p-4 bg-rose-950/60 border border-rose-500/40 rounded-2xl flex items-start space-x-3 text-rose-300 text-sm animate-fadeIn">
            <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
            <div>
              <p className="font-bold text-white">Lectura No Encontrada</p>
              <p className="text-xs mt-0.5 text-rose-300/90">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Ficha Inmediata del Producto Escaneado */}
      {product && (
        <div className="bg-[#0b1226] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden animate-fadeIn">
          {/* Header de la Ficha */}
          <div className="bg-[#070e22] text-white p-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs font-black bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-lg">
                  {product.codigo}
                </span>
                <span className="text-xs text-slate-400">
                  {product.categoria_nombre || 'Sin categoría'}
                </span>
              </div>
              <h3 className="text-xl font-black text-white mt-1.5">{product.nombre}</h3>
            </div>

            {/* Badge de Estado */}
            <div>
              {product.estado === 'DISPONIBLE' && (
                <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>DISPONIBLE</span>
                </span>
              )}
              {product.estado === 'STOCK BAJO' && (
                <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-950/80 text-amber-400 border border-amber-500/40 flex items-center space-x-1.5 animate-pulse">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>STOCK BAJO</span>
                </span>
              )}
              {product.estado === 'AGOTADO' && (
                <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-950/80 text-rose-400 border border-rose-500/40 flex items-center space-x-1.5">
                  <XCircle className="w-4 h-4 text-rose-400" />
                  <span>AGOTADO</span>
                </span>
              )}
            </div>
          </div>

          {/* Cuerpo de la Ficha */}
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Imagen o Placeholder */}
              <div className="md:col-span-1 flex items-center justify-center p-4 bg-slate-900/60 rounded-2xl border border-slate-800 min-h-[160px]">
                {product.imagen ? (
                  <img
                    src={product.imagen}
                    alt={product.nombre}
                    className="max-h-40 max-w-full object-contain rounded-xl"
                  />
                ) : (
                  <div className="text-center text-slate-500">
                    <Package className="w-12 h-12 mx-auto text-slate-600 mb-1" />
                    <span className="text-[11px]">Sin fotografía</span>
                  </div>
                )}
              </div>

              {/* Métricas Principales */}
              <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Stock Actual
                  </span>
                  <span
                    className={`text-2xl font-black mt-1 block ${
                      product.stock_actual === 0
                        ? 'text-rose-400'
                        : product.stock_actual <= product.stock_minimo
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {product.stock_actual}
                  </span>
                  <span className="text-[11px] block text-slate-400 font-medium">
                    {product.unidad_medida}
                  </span>
                </div>

                <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Stock Mínimo
                  </span>
                  <span className="text-2xl font-black text-slate-300 mt-1 block">
                    {product.stock_minimo}
                  </span>
                  <span className="text-[11px] block text-slate-400 font-medium">
                    {product.unidad_medida}
                  </span>
                </div>

                <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 col-span-2 sm:col-span-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Proveedor
                  </span>
                  <span className="text-xs font-bold text-slate-200 line-clamp-2 mt-1">
                    {product.proveedor || 'Sin especificar'}
                  </span>
                </div>
              </div>
            </div>

            {/* Ubicación Física Detallada */}
            <div className="p-4.5 bg-emerald-950/20 rounded-2xl border border-emerald-500/30">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-400 mb-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>UBICACIÓN FÍSICA ASIGNADA</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-semibold">
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-normal">Almacén</span>
                  <span className="text-white font-bold">{product.ubicacion_almacen || 'Principal'}</span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-normal">Pasillo</span>
                  <span className="text-white font-bold">{product.ubicacion_pasillo || 'Sin asignar'}</span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-normal">Estante</span>
                  <span className="text-white font-bold">{product.ubicacion_estante || 'Sin asignar'}</span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-normal">Nivel</span>
                  <span className="text-white font-bold">{product.ubicacion_nivel || 'Sin asignar'}</span>
                </div>
              </div>
            </div>

            {product.descripcion && (
              <p className="text-xs text-slate-400 italic bg-slate-900/40 p-3 rounded-xl border border-slate-800/80">
                "{product.descripcion}"
              </p>
            )}
          </div>

          {/* Barra de Acciones Inmediatas */}
          <div className="px-6 py-4.5 bg-[#070e22] border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Registrar Ingreso */}
              <button
                onClick={() => onOpenInbound(product)}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl flex items-center space-x-1.5 shadow-lg shadow-emerald-950/40 transition cursor-pointer"
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>📥 Registrar Ingreso</span>
              </button>

              {/* Registrar Despacho */}
              <button
                onClick={() => onOpenOutbound(product)}
                disabled={product.stock_actual === 0}
                className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl flex items-center space-x-1.5 shadow-lg shadow-sky-950/40 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>📤 Registrar Despacho</span>
              </button>

              {/* Ajuste de Inventario (Admin) */}
              {isAdmin && (
                <button
                  onClick={() => onOpenAdjust(product)}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl flex items-center space-x-1.5 shadow-lg shadow-amber-950/40 transition cursor-pointer"
                >
                  <Scale className="w-4 h-4" />
                  <span>⚖️ Ajuste</span>
                </button>
              )}

              {/* Imprimir Etiqueta */}
              <button
                onClick={() => onOpenLabel(product)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center space-x-1.5 shadow-xs transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-blue-400" />
                <span>Imprimir Etiqueta</span>
              </button>
            </div>

            <button
              onClick={() => onOpenHistory(product)}
              className="text-xs font-bold text-slate-400 hover:text-white flex items-center space-x-1 transition cursor-pointer"
            >
              <History className="w-4 h-4 text-purple-400" />
              <span>Ver Historial ({movements.length} movimientos)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};