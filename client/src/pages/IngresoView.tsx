import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowDown,
  Tags,
  Search,
  Barcode,
  Camera,
  CheckCircle2,
  AlertCircle,
  Plus,
  Edit2,
  MapPin,
  Package,
  X,
  History,
  FileText,
  Truck,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { Product, Category, Movement } from '../types';
import { api } from '../services/api';
import { sound } from '../services/sound';
import { useAuth } from '../context/AuthContext';

interface IngresoViewProps {
  initialTab?: 'ingreso-flujo' | 'ingreso-categorias';
  onGoBack: () => void;
  onOpenScannerCamera: () => void;
  onSuccessMutation: () => void;
  initialProduct?: Product | null;
  onExploreCategory?: (category: Category) => void;
}

const CATEGORY_IMAGE_PRESETS = [
  { name: 'Herramientas', url: 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=600&auto=format&fit=crop&q=80' },
  { name: 'Electricidad', url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80' },
  { name: 'Construcción', url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&auto=format&fit=crop&q=80' },
  { name: 'Seguridad / EPP', url: 'https://images.unsplash.com/photo-1578873375972-005cf4cb6983?w=600&auto=format&fit=crop&q=80' },
  { name: 'Ferretería', url: 'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?w=600&auto=format&fit=crop&q=80' },
  { name: 'Repuestos', url: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=600&auto=format&fit=crop&q=80' },
];

export const IngresoView: React.FC<IngresoViewProps> = ({
  initialTab = 'ingreso-flujo',
  onGoBack,
  onOpenScannerCamera,
  onSuccessMutation,
  initialProduct,
  onExploreCategory,
}) => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'flujo' | 'categorias'>(
    initialTab === 'ingreso-categorias' ? 'categorias' : 'flujo'
  );

  // Estados del Flujo de Ingreso
  const [searchInput, setSearchInput] = useState('');
  const [product, setProduct] = useState<Product | null>(initialProduct || null);
  const [cantidad, setCantidad] = useState('1');
  const [proveedor, setProveedor] = useState('');
  const [guiaDespacho, setGuiaDespacho] = useState('');
  const [observacion, setObservacion] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Historial de últimos ingresos registrados
  const [recentInbounds, setRecentInbounds] = useState<Movement[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Estados de Categorías
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchCategory, setSearchCategory] = useState('');
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catNombre, setCatNombre] = useState('');
  const [catPrefijo, setCatPrefijo] = useState('');
  const [catDescripcion, setCatDescripcion] = useState('');
  const [catImagen, setCatImagen] = useState('');
  const [catError, setCatError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProduct) {
      setProduct(initialProduct);
      setProveedor(initialProduct.proveedor || '');
    }
  }, [initialProduct]);

  useEffect(() => {
    if (activeTab === 'flujo') {
      searchInputRef.current?.focus();
      loadRecentInbounds();
    } else {
      loadCategories();
    }
  }, [activeTab]);

  const loadRecentInbounds = async () => {
    setLoadingRecent(true);
    try {
      const res = await api.movements.getAll({ tipo: 'INGRESO', limit: 8 });
      setRecentInbounds(res.movements);
    } catch (err) {
      console.error('Error cargando ingresos recientes:', err);
    } finally {
      setLoadingRecent(false);
    }
  };

  const loadCategories = async () => {
    setLoadingCategories(true);
    try {
      const res = await api.categories.getAll();
      setCategories(res.categories);
    } catch (err) {
      console.error('Error cargando categorías:', err);
    } finally {
      setLoadingCategories(false);
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
      setProveedor(res.product.proveedor || '');
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
  const newStock = currentStock + parsedQty;

  const handleConfirmInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) {
      setErrorMessage('Identifique o escanee un producto primero.');
      return;
    }

    if (parsedQty <= 0) {
      setErrorMessage('La cantidad a ingresar debe ser mayor a 0.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const movementResult = await api.movements.inbound({
        producto_id: product.id,
        cantidad: parsedQty,
        proveedor: proveedor.trim() || undefined,
        guia_despacho: guiaDespacho.trim() || undefined,
        observacion: observacion.trim() || undefined,
      });
      const resultingStock = movementResult.stock_nuevo ?? newStock;

      sound.playSuccess();
      setSuccessMessage(
        movementResult.queued
          ? `Ingreso guardado localmente y pendiente de sincronización: +${parsedQty} ${product.unidad_medida} a "${product.nombre}". Stock local: ${resultingStock}.`
          : `Ingreso confirmado: Se sumaron +${parsedQty} ${product.unidad_medida} a "${product.nombre}". Nuevo stock: ${resultingStock}.`
      );

      // Actualizar el estado local del producto
      setProduct({
        ...product,
        stock_actual: resultingStock,
      });

      setCantidad('1');
      setGuiaDespacho('');
      setObservacion('');
      loadRecentInbounds();
      onSuccessMutation();

      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
    } catch (err: unknown) {
      sound.playError();
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Error al registrar el ingreso.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Gestión de categorías
  const handleOpenCatModal = (cat?: Category) => {
    if (cat) {
      setEditingCat(cat);
      setCatNombre(cat.nombre);
      setCatPrefijo(cat.prefijo || '');
      setCatDescripcion(cat.descripcion || '');
      setCatImagen(cat.imagen || '');
    } else {
      setEditingCat(null);
      setCatNombre('');
      setCatPrefijo('');
      setCatDescripcion('');
      setCatImagen('');
    }
    setCatError(null);
    setIsCatModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNombre.trim()) {
      setCatError('El nombre de la categoría es obligatorio.');
      return;
    }

    try {
      if (editingCat) {
        await api.categories.update(editingCat.id, {
          nombre: catNombre.trim(),
          prefijo: catPrefijo.trim() || undefined,
          descripcion: catDescripcion.trim() || undefined,
          imagen: catImagen.trim() || undefined,
        });
      } else {
        await api.categories.create({
          nombre: catNombre.trim(),
          prefijo: catPrefijo.trim() || undefined,
          descripcion: catDescripcion.trim() || undefined,
          imagen: catImagen.trim() || undefined,
        });
      }
      setIsCatModalOpen(false);
      loadCategories();
      onSuccessMutation();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setCatError(err.message);
      } else {
        setCatError('Error al guardar la categoría.');
      }
    }
  };

  const filteredCategories = categories.filter((c) => {
    if (!searchCategory.trim()) return true;
    const term = searchCategory.toLowerCase();
    return (
      c.nombre.toLowerCase().includes(term) ||
      (c.prefijo && c.prefijo.toLowerCase().includes(term)) ||
      (c.descripcion && c.descripcion.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full py-4 sm:py-6 px-4 sm:px-6">
      {/* Barra de Navegación Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <button
            onClick={onGoBack}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-300 transition group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform text-emerald-400" />
            <span>Centro de Operaciones</span>
          </button>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
              ÁREA DE RECEPCIÓN
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide">
              📥 Ingresos y Categorías
            </h1>
          </div>
        </div>

        {/* Selector de Pestañas: Ingreso vs Categorías */}
        <div className="flex items-center p-1.5 bg-[#091a16] border border-emerald-950/80 rounded-2xl">
          <button
            onClick={() => setActiveTab('flujo')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'flujo'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ArrowDown className="w-4 h-4" />
            <span>Ingreso de Producto</span>
          </button>

          <button
            onClick={() => setActiveTab('categorias')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'categorias'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Tags className="w-4 h-4" />
            <span>Categorías</span>
          </button>
        </div>
      </div>

      {/* ---------------- PESTAÑA 1: FLUJO RÁPIDO DE INGRESO (2 COLUMNAS) ---------------- */}
      {activeTab === 'flujo' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* COLUMNA IZQUIERDA: Formulario e Identificación (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Mensajes de Estado */}
            {successMessage && (
              <div className="p-4 bg-emerald-950/80 border border-emerald-500/50 rounded-2xl flex items-center space-x-3 text-emerald-300 text-sm shadow-lg animate-fade-in">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="flex-1 font-semibold">{successMessage}</div>
                <button
                  onClick={() => setSuccessMessage(null)}
                  className="text-emerald-400 hover:text-emerald-200"
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
                <label className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center space-x-2">
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
                    className="w-full pl-10 pr-4 py-3.5 bg-[#070e22] border-2 border-slate-800 rounded-2xl text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition text-sm font-bold"
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
                  className="px-4 py-3.5 bg-emerald-950 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-400 font-bold rounded-2xl text-xs flex items-center justify-center space-x-2 transition cursor-pointer"
                  title="Escanear con la cámara del dispositivo"
                >
                  <Camera className="w-4 h-4" />
                  <span>Cámara</span>
                </button>
              </div>

              {/* Ficha Visual del Producto Identificado */}
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
                      <div className="w-14 h-14 rounded-xl bg-[#0f2a24] border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                        <Package className="w-7 h-7" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
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
                        <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>
                          {[product.ubicacion_almacen, product.ubicacion_pasillo, product.ubicacion_estante, product.ubicacion_nivel]
                            .filter(Boolean)
                            .join(' • ') || 'Sin ubicación física registrada'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-[#061914] rounded-xl border border-emerald-500/30 text-center sm:text-right min-w-[130px] shrink-0">
                    <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400 block">
                      STOCK ACTUAL
                    </span>
                    <span className="text-2xl font-black text-white">
                      {product.stock_actual}
                    </span>{' '}
                    <span className="text-xs text-emerald-300 font-medium">{product.unidad_medida}</span>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-[#080f24]/50 rounded-2xl border border-dashed border-slate-800 text-center py-6 text-slate-500 text-xs">
                  <Package className="w-8 h-8 mx-auto text-slate-600 mb-1.5 opacity-50" />
                  Escanee o busque un producto para habilitar los parámetros de ingreso.
                </div>
              )}
            </div>

            {/* SECCIÓN 2: PARÁMETROS DE INGRESO */}
            {product && (
              <div className="bg-[#0b1226] border border-[#172547] rounded-3xl p-6 sm:p-7 shadow-xl space-y-5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center space-x-2">
                    <span>2. PARÁMETROS DE INGRESO</span>
                  </label>
                  <span className="text-xs font-mono text-slate-400">
                    Unidad: <strong className="text-white">{product.unidad_medida}</strong>
                  </span>
                </div>

                <form onSubmit={handleConfirmInbound} className="space-y-5">
                  {/* Selector de Cantidad Grande */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                      CANTIDAD A INGRESAR ({product.unidad_medida}) *
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="number"
                        min="1"
                        required
                        value={cantidad}
                        onChange={(e) => setCantidad(e.target.value)}
                        className="flex-1 px-4 py-3 text-3xl font-black bg-[#070e22] border-2 border-slate-800 rounded-2xl text-emerald-400 focus:outline-none focus:border-emerald-500 transition"
                      />

                      {/* Botones de incremento rápido */}
                      <div className="flex space-x-1.5">
                        {[1, 5, 10, 50, 100].map((inc) => (
                          <button
                            key={inc}
                            type="button"
                            onClick={() => setCantidad(String(Math.max(1, parsedQty + inc)))}
                            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer"
                          >
                            +{inc}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Proveedor y Guía de Despacho */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Proveedor u Origen
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Ej. Aceros del Norte S.A."
                          value={proveedor}
                          onChange={(e) => setProveedor(e.target.value)}
                          className="w-full pl-9 pr-3.5 py-2.5 bg-[#070e22] border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500"
                        />
                        <Truck className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Nº Guía de Despacho / Factura
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Ej. GD-88210 / F001-492"
                          value={guiaDespacho}
                          onChange={(e) => setGuiaDespacho(e.target.value)}
                          className="w-full pl-9 pr-3.5 py-2.5 bg-[#070e22] border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500"
                        />
                        <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      </div>
                    </div>
                  </div>

                  {/* Observación */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Observación (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Recepción lote mensual conforme sin daños físicos..."
                      value={observacion}
                      onChange={(e) => setObservacion(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#070e22] border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Cálculo en Vivo de Stock */}
                  <div className="p-3.5 bg-[#080f24] rounded-2xl border border-slate-800 flex items-center justify-between text-xs font-semibold">
                    <div className="text-slate-400">
                      Actual: <span className="text-white font-bold">{currentStock} {product.unidad_medida}</span>
                    </div>
                    <div className="text-emerald-400 font-bold">
                      +{parsedQty} {product.unidad_medida}
                    </div>
                    <div className="text-slate-300">
                      → Nuevo Stock:{' '}
                      <span className="text-white font-black text-sm bg-emerald-950 px-2.5 py-1 rounded-lg border border-emerald-500/40">
                        {newStock} {product.unidad_medida}
                      </span>
                    </div>
                  </div>

                  {/* Botón Principal: CONFIRMAR INGRESO */}
                  <button
                    type="submit"
                    disabled={isSubmitting || parsedQty <= 0}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm uppercase tracking-wider rounded-2xl flex items-center justify-center space-x-2 shadow-xl shadow-emerald-950/60 transition disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-5 h-5" />
                    <span>{isSubmitting ? 'REGISTRANDO INGRESO...' : '+ CONFIRMAR INGRESO'}</span>
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* COLUMNA DERECHA: ÚLTIMOS INGRESOS REGISTRADOS (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-[#0b1226] border border-[#172547] rounded-3xl p-5 sm:p-6 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <History className="w-4 h-4" />
                  </div>
                  <h2 className="text-xs font-black uppercase tracking-wider text-white">
                    ÚLTIMOS INGRESOS REGISTRADOS
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-slate-500">En tiempo real</span>
              </div>

              {loadingRecent ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  Cargando ingresos recientes...
                </div>
              ) : recentInbounds.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  <ArrowDown className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
                  No se han registrado ingresos hoy.
                </div>
              ) : (
                <div className="space-y-3">
                  {recentInbounds.map((mov) => (
                    <div
                      key={mov.id}
                      className="p-3.5 bg-[#080f24] hover:bg-[#0c1636] border border-slate-800/80 rounded-2xl flex items-center justify-between transition group"
                    >
                      <div className="flex items-start space-x-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                          <ArrowDown className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-mono text-[10px] font-bold text-slate-400">
                              {mov.producto_codigo}
                            </span>
                            {mov.guia_despacho && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-emerald-300 font-mono">
                                {mov.guia_despacho}
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs font-bold text-white group-hover:text-emerald-300 transition truncate max-w-[180px]">
                            {mov.producto_nombre}
                          </h4>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Por {mov.usuario_nombre} · {mov.fecha} {mov.hora.slice(0, 5)}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-sm font-black text-emerald-400">
                          +{mov.cantidad}
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
      )}

      {/* ---------------- PESTAÑA 2: GESTIÓN DE CATEGORÍAS (3 COLUMNAS DE TARJETAS) ---------------- */}
      {activeTab === 'categorias' && (
        <div className="space-y-6">
          {/* Header de Categorías con Buscador y Botón "+ Crear Categoría" */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
                CATEGORÍAS DE ALMACÉN
              </span>
              <h2 className="text-xl font-black text-white tracking-wide">
                Clasificación de Materiales, Herramientas y Repuestos
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Organice el inventario en familias para facilitar la búsqueda y trazabilidad.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              {/* Buscador de Categorías */}
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Buscar categoría o prefijo..."
                  value={searchCategory}
                  onChange={(e) => setSearchCategory(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-[#080f24] border border-slate-800 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              </div>

              {/* Botón Principal para Añadir Categoría */}
              <button
                onClick={() => handleOpenCatModal()}
                className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/50 transition hover:scale-105 active:scale-95 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Crear Categoría</span>
              </button>
            </div>
          </div>

          {/* Rejilla de Tarjetas de Categoría (3 Columnas) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {loadingCategories ? (
              <div className="col-span-3 text-center py-16 text-slate-500 text-xs">
                Cargando categorías...
              </div>
            ) : filteredCategories.length === 0 ? (
              <div className="col-span-3 text-center py-16 text-slate-500 text-xs">
                No se encontraron categorías que coincidan con la búsqueda.
              </div>
            ) : (
              <>
                {filteredCategories.map((cat) => {
                  const bannerImg =
                    cat.imagen ||
                    'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=600&auto=format&fit=crop&q=80';

                  return (
                    <div
                      key={cat.id}
                      className="bg-[#0b1226] border border-[#172547] hover:border-emerald-500/50 rounded-3xl overflow-hidden shadow-xl flex flex-col justify-between transition group"
                    >
                      {/* Banner de Imagen con Prefijo y Botón Editar */}
                      <div className="relative h-36 w-full overflow-hidden bg-slate-900">
                        <img
                          src={bannerImg}
                          alt={cat.nombre}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-80 group-hover:opacity-100"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1226] via-transparent to-black/40" />

                        {/* Badge de Prefijo */}
                        <div className="absolute top-3 left-3">
                          <span className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-emerald-400 border border-emerald-500/40 text-xs font-mono font-black tracking-wider shadow">
                            {cat.prefijo || 'CAT'}
                          </span>
                        </div>

                        {/* Botón Editar */}
                        <div className="absolute top-3 right-3">
                          <button
                            onClick={() => handleOpenCatModal(cat)}
                            className="p-2 rounded-xl bg-black/60 hover:bg-emerald-600 backdrop-blur-md text-slate-300 hover:text-white border border-white/10 transition cursor-pointer"
                            title="Editar categoría"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Cuerpo de la Tarjeta */}
                      <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                        <div>
                          <h3 className="font-black text-white text-lg tracking-wide group-hover:text-emerald-300 transition">
                            {cat.nombre}
                          </h3>
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                            {cat.descripcion || 'Sin descripción asignada para esta categoría de inventario.'}
                          </p>
                        </div>

                        {/* Métricas y Explorar */}
                        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                          <div className="flex items-center space-x-3 text-slate-400">
                            <span className="font-bold text-slate-200">
                              {cat.total_productos ?? 0}{' '}
                              <span className="text-slate-500 font-normal">modelos</span>
                            </span>
                            <span>•</span>
                            <span className="font-bold text-emerald-400">
                              {cat.total_unidades ?? 0}{' '}
                              <span className="text-slate-500 font-normal">unid.</span>
                            </span>
                          </div>

                          {onExploreCategory && (
                            <button
                              onClick={() => onExploreCategory(cat)}
                              className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center space-x-1 cursor-pointer"
                            >
                              <span>Explorar</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Tarjeta Interactiva para Crear Nueva Categoría */}
                <div
                  onClick={() => handleOpenCatModal()}
                  className="bg-[#080f24]/70 hover:bg-[#0c1836] border-2 border-dashed border-slate-800 hover:border-emerald-500/60 rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition group min-h-[260px]"
                >
                  <div className="w-14 h-14 rounded-2xl bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition shadow-lg">
                    <Plus className="w-7 h-7" />
                  </div>
                  <span className="text-sm font-black text-white group-hover:text-emerald-400 mt-4">
                    + Crear Nueva Categoría
                  </span>
                  <span className="text-xs text-slate-400 mt-1 max-w-[200px]">
                    Añade una clasificación para nuevos insumos o familias
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------------- MODAL CREAR / EDITAR CATEGORÍA (media_1788804127404.png) ---------------- */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#0b1226] border border-[#172547] rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl animate-scale-in">
            {/* Header del Modal */}
            <div className="px-6 py-5 bg-[#070e22] border-b border-slate-800 flex justify-between items-start">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
                  {editingCat ? 'CONFIGURACIÓN DE CATEGORÍA' : 'NUEVA CLASIFICACIÓN'}
                </span>
                <h3 className="text-lg font-black text-white tracking-wide">
                  {editingCat ? 'Editar Categoría' : 'Nueva Categoría'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Crear una nueva clasificación para organizar los productos en el almacén.
                </p>
              </div>
              <button
                onClick={() => setIsCatModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSaveCategory} className="p-6 space-y-4">
              {catError && (
                <div className="p-3 bg-red-950/80 border border-red-500/50 rounded-xl text-xs text-red-300 font-semibold flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{catError}</span>
                </div>
              )}

              {/* Nombre de la Categoría */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Nombre de la Categoría *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Ferretería y Fijaciones"
                  value={catNombre}
                  onChange={(e) => {
                    setCatNombre(e.target.value);
                    if (!catPrefijo && !editingCat && e.target.value.trim().length >= 3) {
                      setCatPrefijo(e.target.value.trim().slice(0, 3).toUpperCase());
                    }
                  }}
                  className="w-full px-4 py-2.5 bg-[#070e22] border border-slate-800 rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              {/* Código / Prefijo */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Código / Prefijo *
                  </label>
                  <span className="text-[10px] text-slate-400">
                    3 letras para generar códigos (ej: FER-001)
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={5}
                  required
                  placeholder="Ej. FER"
                  value={catPrefijo}
                  onChange={(e) => setCatPrefijo(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2.5 bg-[#070e22] border border-slate-800 rounded-xl text-emerald-400 font-mono text-sm font-black focus:outline-none focus:border-emerald-500 transition uppercase"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Descripción (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Tornillería, pernos, anclajes, arandelas y elementos de unión..."
                  value={catDescripcion}
                  onChange={(e) => setCatDescripcion(e.target.value)}
                  className="w-full px-4 py-2 bg-[#070e22] border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              {/* URL de Imagen de Portada y Preajustes Rápidos */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Imagen de Portada (URL o Preajuste)
                </label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={catImagen}
                  onChange={(e) => setCatImagen(e.target.value)}
                  className="w-full px-4 py-2 bg-[#070e22] border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-emerald-500 mb-2"
                />

                {/* Preajustes rápidos */}
                <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
                  <span className="text-[10px] text-slate-500 shrink-0 font-medium">Preajustes:</span>
                  {CATEGORY_IMAGE_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setCatImagen(p.url)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer shrink-0 ${
                        catImagen === p.url
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/60'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="pt-3 border-t border-slate-800/80 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsCatModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-950/50 transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{editingCat ? 'Guardar Cambios' : 'Crear Categoría'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
