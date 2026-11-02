import React, { useState, useEffect } from 'react';
import {
  Package,
  Layers,
  AlertTriangle,
  XCircle,
  Search,
  Filter,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Printer,
  Edit2,
  Trash2,
  MapPin,
  Barcode,
  History,
  Clock,
  ArrowRight,
  Sun,
  Moon,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { Product, Category, DashboardSummary } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface DashboardProps {
  onOpenInbound: (product?: Product) => void;
  onOpenOutbound: (product?: Product) => void;
  onOpenNewProduct: () => void;
  onOpenEditProduct: (product: Product) => void;
  onOpenLabel: (product: Product) => void;
  onNavigateSection: (section: 'historial' | 'alertas' | 'scanner') => void;
  refreshKey: number;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onOpenInbound,
  onOpenOutbound,
  onOpenNewProduct,
  onOpenEditProduct,
  onOpenLabel,
  onNavigateSection,
  refreshKey,
}) => {
  const { user, isAdmin } = useAuth();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros de búsqueda
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [sortBy, setSortBy] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [sumRes, prodRes, catRes] = await Promise.all([
        api.dashboard.getSummary(),
        api.products.getAll({
          search: search || undefined,
          categoria_id: selectedCategory || undefined,
          estado: selectedStatus || undefined,
          sort_by: sortBy || undefined,
        }),
        api.categories.getAll(),
      ]);

      setSummary(sumRes);
      setProducts(prodRes.products);
      setCategories(catRes.categories);
    } catch (err) {
      console.error('Error cargando datos del dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedCategory, selectedStatus, sortBy, refreshKey]);

  const handleDeleteProduct = async (product: Product) => {
    if (!window.confirm(`¿Está seguro de eliminar permanentemente el producto "${product.nombre}" (${product.codigo})?`)) {
      return;
    }
    try {
      await api.products.delete(product.id);
      loadData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message);
      }
    }
  };

  // Saludo dinámico según la hora del día
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 19) return 'Buenas tardes';
    return 'Buenas noches';
  };

  // Formato de fecha actual en español
  const getFormattedDate = () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    };
    const formatted = now.toLocaleDateString('es-ES', options);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* 1. GREETING BANNER CON ACCIONES RÁPIDAS (media_1788804109981.png) */}
      <div className="bg-gradient-to-r from-[#0b162c] via-[#0b1226] to-[#070e22] border border-[#172547] rounded-3xl p-6 sm:p-7 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 block mb-1">
            PANEL DE OPERACIONES LOGÍSTICAS
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-wide">
            {getGreeting()}, {user?.nombre || 'Operador'}
          </h2>
          <p className="text-xs text-slate-400 mt-1 flex items-center space-x-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Turno Activo · Almacén Central · {getFormattedDate()}</span>
          </p>
        </div>

        {/* Botones de Acción Directa */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onOpenInbound()}
            className="px-4 py-2.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl flex items-center space-x-2 shadow-lg shadow-emerald-950/40 transition hover:scale-105 active:scale-95 cursor-pointer"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>+ Ingreso Mercancía</span>
          </button>

          <button
            onClick={() => onOpenOutbound()}
            className="px-4 py-2.5 text-xs font-black text-white bg-sky-600 hover:bg-sky-500 rounded-xl flex items-center space-x-2 shadow-lg shadow-sky-950/40 transition hover:scale-105 active:scale-95 cursor-pointer"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>📤 Despacho</span>
          </button>

          {isAdmin && (
            <button
              onClick={onOpenNewProduct}
              className="px-4 py-2.5 text-xs font-black text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 rounded-xl flex items-center space-x-2 shadow transition hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>+ Nuevo Producto</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. 4 TARJETAS KPI INFORMATIVAS (media_1788804109981.png) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TOTAL PRODUCTOS */}
        <div className="bg-[#0b1226] border border-[#172547] p-5 rounded-3xl shadow-xl hover:border-blue-500/40 transition group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              TOTAL PRODUCTOS
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-950/80 border border-blue-500/30 text-blue-400 flex items-center justify-center group-hover:scale-110 transition">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl sm:text-4xl font-black text-white mt-3">
            {summary?.kpis.total_productos.toLocaleString() || 0}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 font-medium">Referencias activas</p>
        </div>

        {/* TOTAL EXISTENCIAS */}
        <div className="bg-[#0b1226] border border-[#172547] p-5 rounded-3xl shadow-xl hover:border-emerald-500/40 transition group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              TOTAL EXISTENCIAS
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl sm:text-4xl font-black text-emerald-400 mt-3">
            {summary?.kpis.total_existencias.toLocaleString() || 0}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 font-medium">Unidades totales almacenadas</p>
        </div>

        {/* ALERTAS DE STOCK */}
        <div
          onClick={() => onNavigateSection('alertas')}
          className="bg-[#0b1226] border border-[#172547] p-5 rounded-3xl shadow-xl hover:border-amber-500/50 cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
              ALERTAS DE STOCK
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-950/80 border border-amber-500/30 text-amber-400 flex items-center justify-center group-hover:scale-110 transition">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl sm:text-4xl font-black text-amber-400 mt-3">
            {summary?.kpis.stock_bajo || 0}
          </p>
          <p className="text-[11px] text-amber-300/80 mt-1 flex items-center space-x-1 font-semibold">
            <span>Requieren reposición</span>
            <ArrowRight className="w-3 h-3 inline" />
          </p>
        </div>

        {/* SIN EXISTENCIAS */}
        <div
          onClick={() => onNavigateSection('alertas')}
          className="bg-[#0b1226] border border-[#172547] p-5 rounded-3xl shadow-xl hover:border-red-500/50 cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-red-400">
              SIN EXISTENCIAS
            </span>
            <div className="w-9 h-9 rounded-xl bg-red-950/80 border border-red-500/30 text-red-400 flex items-center justify-center group-hover:scale-110 transition">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl sm:text-4xl font-black text-red-400 mt-3">
            {summary?.kpis.agotados || 0}
          </p>
          <p className="text-[11px] text-red-300/80 mt-1 flex items-center space-x-1 font-semibold">
            <span>Agotados: reponer hoy</span>
            <ArrowRight className="w-3 h-3 inline" />
          </p>
        </div>
      </div>

      {/* 3. BLOQUE DOBLE: ACTIVIDAD RECIENTE (IZQ) & PRODUCTOS CON STOCK BAJO (DER) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ACTIVIDAD RECIENTE (7 COLS) */}
        <div className="lg:col-span-7 bg-[#0b1226] border border-[#172547] rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-950/80 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <History className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                ACTIVIDAD RECIENTE DE ALMACÉN
              </h3>
            </div>
            <button
              onClick={() => onNavigateSection('historial')}
              className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center space-x-1 transition cursor-pointer"
            >
              <span>Ver todo el historial</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {!summary || summary.ultimos_movimientos.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs">
              No hay movimientos registrados recientemente.
            </div>
          ) : (
            <div className="space-y-2.5">
              {summary.ultimos_movimientos.slice(0, 5).map((mov) => {
                const isIngreso = mov.tipo === 'INGRESO';
                const isDespacho = mov.tipo === 'DESPACHO';

                return (
                  <div
                    key={mov.id}
                    className="p-3.5 bg-[#080f24] hover:bg-[#0d1738] border border-slate-800/80 rounded-2xl flex items-center justify-between transition group"
                  >
                    <div className="flex items-center space-x-3">
                      <span
                        className={`font-mono font-black text-[10px] px-2 py-0.5 rounded-lg border ${
                          isIngreso
                            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40'
                            : isDespacho
                            ? 'bg-sky-950/90 text-sky-300 border-sky-500/40'
                            : 'bg-amber-950/90 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        {mov.tipo}
                      </span>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-[10px] text-slate-400 font-bold">
                            {mov.producto_codigo}
                          </span>
                          <span className="text-xs font-bold text-white group-hover:text-blue-300 transition truncate max-w-[200px]">
                            {mov.producto_nombre}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Por {mov.usuario_nombre} · {mov.fecha} {mov.hora.slice(0, 5)}
                          {mov.destino ? ` → ${mov.destino}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-sm font-black ${
                          isIngreso
                            ? 'text-emerald-400'
                            : isDespacho
                            ? 'text-sky-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {isIngreso ? `+${mov.cantidad}` : isDespacho ? `-${mov.cantidad}` : `Δ ${mov.cantidad}`}
                      </span>{' '}
                      <span className="text-[10px] text-slate-400 block font-medium">
                        {mov.unidad_medida || 'UNID'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* PRODUCTOS CON STOCK BAJO (5 COLS) (media_1788804109981.png) */}
        <div className="lg:col-span-5 bg-[#0b1226] border border-[#172547] rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-950/80 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                PRODUCTOS CON STOCK BAJO
              </h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-500/30 font-bold">
              {summary?.alertas_reposicion.length || 0} en alerta
            </span>
          </div>

          {!summary || summary.alertas_reposicion.length === 0 ? (
            <div className="p-6 bg-[#080f24] rounded-2xl border border-slate-800 text-center text-xs text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
              <p className="font-bold text-white">Inventario en niveles óptimos</p>
              <p className="text-[11px] text-slate-500 mt-1">Ningún producto está por debajo de su stock mínimo.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {summary.alertas_reposicion.slice(0, 5).map((prod) => {
                const percent = Math.min(100, Math.round((prod.stock_actual / (prod.stock_minimo || 1)) * 100));
                const isZero = prod.stock_actual === 0;

                return (
                  <div
                    key={prod.id}
                    className="p-3.5 bg-[#080f24] border border-slate-800/80 hover:border-amber-500/40 rounded-2xl flex items-center justify-between transition group"
                  >
                    <div className="space-y-1 max-w-[200px]">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-mono text-[10px] font-black px-1.5 py-0.2 rounded bg-slate-800 text-amber-400 border border-slate-700">
                          {prod.codigo}
                        </span>
                        <h4 className="text-xs font-bold text-white truncate">
                          {prod.nombre}
                        </h4>
                      </div>
                      <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                        <span>
                          Stock: <strong className={isZero ? 'text-red-400' : 'text-amber-400'}>{prod.stock_actual}</strong> / Mín: {prod.stock_minimo} {prod.unidad_medida}
                        </span>
                      </div>
                      {/* Barra de progreso de inventario */}
                      <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isZero ? 'bg-red-500' : 'bg-amber-500'}`}
                          style={{ width: `${Math.max(5, percent)}%` }}
                        />
                      </div>
                    </div>

                    {/* Botón "+ Reponer" */}
                    <button
                      onClick={() => onOpenInbound(prod)}
                      className="px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white font-black text-xs rounded-xl flex items-center space-x-1 shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer shrink-0"
                      title="Registrar ingreso de reposición inmediato"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Reponer</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 4. TABLA GENERAL DE PRODUCTOS / CATÁLOGO DEL ALMACÉN */}
      <div className="bg-[#0b1226] border border-[#172547] rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 block">
              CATÁLOGO GENERAL DE ALMACÉN
            </span>
            <h3 className="text-lg font-black text-white tracking-wide">
              Inventario y Control Físico de Existencias
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {products.length} productos registrados
          </span>
        </div>

        {/* Buscador en Vivo y Filtros de la Tabla */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              placeholder="Buscar por Nombre, Código Interno, Código de Barras, QR, Ubicación..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-xs bg-[#070e22] border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Filtro de Estado */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs bg-[#070e22] border border-slate-800 text-slate-300 rounded-xl px-3 py-2.5 outline-none focus:border-blue-500"
            >
              <option value="">Todos los Estados</option>
              <option value="disponible">🟢 Disponibles</option>
              <option value="bajo">🟡 Stock Bajo</option>
              <option value="agotado">🔴 Agotados</option>
            </select>

            {/* Filtro de Categoría */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs bg-[#070e22] border border-slate-800 text-slate-300 rounded-xl px-3 py-2.5 outline-none focus:border-blue-500"
            >
              <option value="">Todas las Categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>

            {/* Ordenamiento */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs bg-[#070e22] border border-slate-800 text-slate-300 rounded-xl px-3 py-2.5 outline-none focus:border-blue-500"
            >
              <option value="">Última actualización</option>
              <option value="nombre">Nombre A-Z</option>
              <option value="stock_asc">Menor stock primero</option>
              <option value="stock_desc">Mayor stock primero</option>
            </select>
          </div>
        </div>

        {/* Tabla de Productos Dark Industrial */}
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#070e22] text-slate-400 uppercase text-[10px] tracking-wider font-black border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Código</th>
                <th className="px-4 py-3.5">Barras / QR</th>
                <th className="px-4 py-3.5">Producto / Categoría</th>
                <th className="px-4 py-3.5 text-center">Disponible</th>
                <th className="px-4 py-3.5 text-center">Mínimo</th>
                <th className="px-4 py-3.5">Ubicación Almacén</th>
                <th className="px-4 py-3.5 text-center">Estado</th>
                <th className="px-4 py-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-[#080f24]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    Cargando catálogo de almacén...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center text-slate-500">
                    <Package className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
                    <p className="font-bold text-white text-sm">No se encontraron productos</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Intente modificar los filtros o registre un nuevo producto en el almacén.
                    </p>
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const ubicacion = [p.ubicacion_pasillo, p.ubicacion_estante, p.ubicacion_nivel]
                    .filter(Boolean)
                    .join(' - ');

                  return (
                    <tr key={p.id} className="hover:bg-[#0c1636] transition group">
                      {/* Código */}
                      <td className="px-4 py-3 font-mono font-black text-white whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-blue-400">
                          {p.codigo}
                        </span>
                      </td>

                      {/* Barras y QR */}
                      <td className="px-4 py-3">
                        <div className="font-mono text-[11px] space-y-0.5">
                          <div className="text-slate-300 flex items-center space-x-1" title="Código de barras">
                            <Barcode className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>{p.codigo_barras || 'Sin código'}</span>
                          </div>
                          <div className="text-slate-500 flex items-center space-x-1 text-[10px]" title="Código QR">
                            <span className="font-bold text-emerald-400">QR:</span>
                            <span className="truncate max-w-[110px]">{p.codigo_qr}</span>
                          </div>
                        </div>
                      </td>

                      {/* Nombre y Categoría */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-white text-sm group-hover:text-blue-300 transition">
                          {p.nombre}
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium">
                          {p.categoria_nombre || 'Sin categoría'}
                        </div>
                      </td>

                      {/* Disponible */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className="text-base font-black text-white">
                          {p.stock_actual}
                        </span>{' '}
                        <span className="text-[11px] text-slate-400">{p.unidad_medida}</span>
                      </td>

                      {/* Stock Mínimo */}
                      <td className="px-4 py-3 text-center font-mono text-slate-400 whitespace-nowrap">
                        {p.stock_minimo} {p.unidad_medida}
                      </td>

                      {/* Ubicación */}
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-1.5 text-xs text-slate-300">
                          <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-medium">
                            {ubicacion || p.ubicacion_almacen || 'No asignada'}
                          </span>
                        </div>
                        {p.ubicacion_almacen && (
                          <span className="text-[10px] text-slate-500 block ml-5">
                            {p.ubicacion_almacen}
                          </span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {p.estado === 'DISPONIBLE' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                            🟢 DISPONIBLE
                          </span>
                        )}
                        {p.estado === 'STOCK BAJO' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-500/40 animate-pulse">
                            ⚠️ STOCK BAJO
                          </span>
                        )}
                        {p.estado === 'AGOTADO' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-950 text-red-300 border border-red-500/40">
                            🔴 AGOTADO
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Ingreso Rápido */}
                          <button
                            onClick={() => onOpenInbound(p)}
                            className="p-2 bg-emerald-950/80 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 rounded-xl transition cursor-pointer"
                            title="Registrar Ingreso de este producto"
                          >
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                          </button>

                          {/* Despacho Rápido */}
                          <button
                            onClick={() => onOpenOutbound(p)}
                            disabled={p.stock_actual === 0}
                            className="p-2 bg-sky-950/80 text-sky-400 hover:bg-sky-600 hover:text-white border border-sky-500/30 rounded-xl transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            title="Registrar Despacho de este producto"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>

                          {/* Imprimir Etiqueta */}
                          <button
                            onClick={() => onOpenLabel(p)}
                            className="p-2 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700 rounded-xl transition cursor-pointer"
                            title="Ver e Imprimir Etiqueta con Barcode y QR"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* Editar (Admin) */}
                          {isAdmin && (
                            <button
                              onClick={() => onOpenEditProduct(p)}
                              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
                              title="Editar producto"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Eliminar (Admin) */}
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteProduct(p)}
                              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-950/50 rounded-xl transition cursor-pointer"
                              title="Eliminar producto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
