import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  XCircle,
  ArrowDownLeft,
  Search,
  Package,
  MapPin,
  TrendingDown,
  Sparkles
} from 'lucide-react';
import { Product } from '../types';
import { api } from '../services/api';

interface AlertsPageProps {
  onOpenInbound: (product: Product) => void;
  refreshKey: number;
}

export const AlertsPage: React.FC<AlertsPageProps> = ({ onOpenInbound, refreshKey }) => {
  const [alerts, setAlerts] = useState<Array<Product & { faltante: number }>>([]);
  const [filterType, setFilterType] = useState<'todos' | 'agotados' | 'bajos'>('todos');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadAlerts = async () => {
    setIsLoading(true);
    try {
      const res = await api.dashboard.getSummary();
      setAlerts(res.alertas_reposicion || []);
    } catch (err) {
      console.error('Error cargando alertas de stock:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [refreshKey]);

  const filtered = alerts.filter((item) => {
    if (filterType === 'agotados' && item.stock_actual > 0) return false;
    if (filterType === 'bajos' && item.stock_actual === 0) return false;
    if (search.trim()) {
      const term = search.toLowerCase();
      return (
        item.nombre.toLowerCase().includes(term) ||
        item.codigo.toLowerCase().includes(term) ||
        (item.ubicacion_pasillo && item.ubicacion_pasillo.toLowerCase().includes(term))
      );
    }
    return true;
  });

  const countAgotados = alerts.filter((a) => a.stock_actual === 0).length;
  const countBajos = alerts.filter((a) => a.stock_actual > 0).length;

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white tracking-tight flex items-center space-x-2">
          <AlertTriangle className="w-7 h-7 text-amber-400" />
          <span>Alertas de Stock y Reposición</span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Productos que requieren abastecimiento prioritario según sus niveles de stock mínimo configurados.
        </p>
      </div>

      {/* Resumen de Alertas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          onClick={() => setFilterType('agotados')}
          className={`p-5 rounded-3xl border cursor-pointer transition shadow-xl ${
            filterType === 'agotados'
              ? 'bg-rose-950/60 border-rose-500 ring-2 ring-rose-500/50'
              : 'bg-[#0b1226] border-slate-800 hover:border-rose-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-rose-400">
              PRODUCTOS AGOTADOS (STOCK = 0)
            </span>
            <XCircle className="w-5 h-5 text-rose-400" />
          </div>
          <p className="text-3xl sm:text-4xl font-black text-rose-400 mt-2">{countAgotados}</p>
          <p className="text-[11px] text-slate-400 mt-1">Urgencia máxima: Existencias en cero</p>
        </div>

        <div
          onClick={() => setFilterType('bajos')}
          className={`p-5 rounded-3xl border cursor-pointer transition shadow-xl ${
            filterType === 'bajos'
              ? 'bg-amber-950/60 border-amber-500 ring-2 ring-amber-500/50'
              : 'bg-[#0b1226] border-slate-800 hover:border-amber-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-amber-400">
              STOCK POR DEBAJO DEL MÍNIMO
            </span>
            <TrendingDown className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-3xl sm:text-4xl font-black text-amber-400 mt-2">{countBajos}</p>
          <p className="text-[11px] text-slate-400 mt-1">Requieren orden de compra o recepción</p>
        </div>
      </div>

      {/* Filtros y Búsqueda */}
      <div className="bg-[#0b1226] p-5 rounded-3xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              placeholder="Filtrar por producto o código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 text-white placeholder-slate-500 rounded-xl focus:border-blue-500 focus:outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>

          <div className="flex space-x-1.5 shrink-0">
            <button
              onClick={() => setFilterType('todos')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer border ${
                filterType === 'todos'
                  ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-900/30'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
              }`}
            >
              Todos ({alerts.length})
            </button>
            <button
              onClick={() => setFilterType('agotados')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer border ${
                filterType === 'agotados'
                  ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-900/30'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
              }`}
            >
              Agotados ({countAgotados})
            </button>
            <button
              onClick={() => setFilterType('bajos')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer border ${
                filterType === 'bajos'
                  ? 'bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-900/30'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
              }`}
            >
              Stock Bajo ({countBajos})
            </button>
          </div>
        </div>

        {/* Listado de Productos en Alerta */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {isLoading ? (
            <div className="col-span-2 text-center py-12 text-slate-400 text-xs">
              Cargando alertas de inventario...
            </div>
          ) : filtered.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-slate-400 bg-slate-900/30 rounded-2xl border border-slate-800/80 p-8">
              <Package className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
              <p className="font-bold text-white text-sm">¡Inventario en Niveles Óptimos!</p>
              <p className="text-xs text-slate-400 mt-1">
                No hay productos en estado de alerta o agotados con los filtros seleccionados.
              </p>
            </div>
          ) : (
            filtered.map((item) => {
              const isAgotado = item.stock_actual === 0;

              return (
                <div
                  key={item.id}
                  className={`p-4.5 rounded-2xl border flex flex-col justify-between transition ${
                    isAgotado
                      ? 'bg-rose-950/30 border-rose-500/30 hover:border-rose-500/60'
                      : 'bg-amber-950/30 border-amber-500/30 hover:border-amber-500/60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-purple-300">
                        {item.codigo}
                      </span>
                      <span
                        className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                          isAgotado
                            ? 'bg-rose-950 text-rose-400 border-rose-500/40'
                            : 'bg-amber-950 text-amber-400 border-amber-500/40'
                        }`}
                      >
                        {isAgotado ? '🔴 AGOTADO' : '⚠️ STOCK BAJO'}
                      </span>
                    </div>

                    <h4 className="font-bold text-white text-sm mt-2.5">{item.nombre}</h4>

                    <div className="flex items-center space-x-1.5 text-xs text-slate-400 mt-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>
                        {[item.ubicacion_pasillo, item.ubicacion_estante]
                          .filter(Boolean)
                          .join(' • ') || 'Sin ubicación'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex items-center justify-between">
                    <div className="text-xs">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">
                        Actual / Mínimo
                      </span>
                      <span className="font-black text-sm text-white">
                        {item.stock_actual} / {item.stock_minimo} {item.unidad_medida}
                      </span>
                      <span className="text-[11px] text-rose-400 font-bold block">
                        Faltan: {item.faltante} {item.unidad_medida}
                      </span>
                    </div>

                    {/* Acción Inmediata: Ingresar Mercancía */}
                    <button
                      onClick={() => onOpenInbound(item)}
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl flex items-center space-x-1.5 shadow-lg shadow-emerald-950/50 transition cursor-pointer"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      <span>Ingresar Stock</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};