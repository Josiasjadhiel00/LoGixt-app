import React, { useState, useEffect } from 'react';
import {
  History,
  Filter,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  Calendar,
  User,
  X,
  MapPin,
  CheckCircle,
  FileText
} from 'lucide-react';
import { Movement, Product } from '../types';
import { api } from '../services/api';

interface HistoryPageProps {
  filterProduct?: Product | null;
  onClearProductFilter?: () => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  filterProduct,
  onClearProductFilter,
}) => {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros
  const [selectedType, setSelectedType] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');

  // Detalle de movimiento seleccionado
  const [activeMovement, setActiveMovement] = useState<Movement | null>(null);

  const loadMovements = async () => {
    setIsLoading(true);
    try {
      const res = await api.movements.getAll({
        producto_id: filterProduct ? filterProduct.id : undefined,
        tipo: selectedType || undefined,
        search: search || undefined,
        fecha_desde: fechaDesde || undefined,
        fecha_hasta: fechaHasta || undefined,
      });
      setMovements(res.movements);
    } catch (err) {
      console.error('Error cargando historial de movimientos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMovements();
  }, [filterProduct, selectedType, search, fechaDesde, fechaHasta]);

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center space-x-2">
            <History className="w-7 h-7 text-blue-400" />
            <span>Historial de Movimientos de Almacén</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Registro inmutable de todas las operaciones de ingresos, despachos y ajustes.
          </p>
        </div>

        {filterProduct && (
          <div className="flex items-center space-x-2 bg-emerald-950/80 text-emerald-400 px-3 py-1.5 rounded-xl border border-emerald-500/40 text-xs font-bold">
            <span>Filtrado por: {filterProduct.nombre} ({filterProduct.codigo})</span>
            {onClearProductFilter && (
              <button
                onClick={onClearProductFilter}
                className="p-0.5 hover:bg-emerald-900 rounded text-emerald-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Barra de Filtros */}
      <div className="bg-[#0b1226] p-5 rounded-3xl border border-slate-800 shadow-xl space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Buscador */}
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar por producto, código o usuario..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 text-white placeholder-slate-500 rounded-xl focus:border-blue-500 focus:outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>

          {/* Tipo de Movimiento */}
          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 text-white rounded-xl focus:border-blue-500 focus:outline-none"
            >
              <option value="">Todos los Tipos</option>
              <option value="INGRESO">📥 Solo Ingresos</option>
              <option value="DESPACHO">📤 Solo Despachos</option>
              <option value="AJUSTE">⚖️ Solo Ajustes de Inventario</option>
            </select>
          </div>

          {/* Fecha Desde */}
          <div>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 text-slate-200 rounded-xl focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Fecha Hasta */}
          <div>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 text-slate-200 rounded-xl focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Tabla de Movimientos */}
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#070e22]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#070e22] text-slate-400 uppercase text-[10px] tracking-wider font-black border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Fecha y Hora</th>
                <th className="px-4 py-3.5 text-center">Tipo</th>
                <th className="px-4 py-3.5">Producto</th>
                <th className="px-4 py-3.5 text-center">Cantidad</th>
                <th className="px-4 py-3.5 text-center">Stock Antes → Después</th>
                <th className="px-4 py-3.5">Usuario</th>
                <th className="px-4 py-3.5">Destino / Motivo</th>
                <th className="px-4 py-3.5 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    Cargando movimientos...
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    <History className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                    <p className="font-semibold text-slate-300 text-sm">No hay movimientos registrados</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Las operaciones de entrada, salida y ajustes aparecerán aquí automáticamente.
                    </p>
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const isIngreso = m.tipo === 'INGRESO';
                  const isDespacho = m.tipo === 'DESPACHO';

                  return (
                    <tr key={m.id} className="hover:bg-slate-900/40 transition">
                      {/* Fecha y Hora */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px] text-slate-300">
                        <div>{m.fecha}</div>
                        <div className="text-slate-500 text-[10px]">{m.hora}</div>
                      </td>

                      {/* Tipo */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                            isIngreso
                              ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                              : isDespacho
                              ? 'bg-sky-950/80 text-sky-400 border-sky-500/40'
                              : 'bg-amber-950/80 text-amber-400 border-amber-500/40'
                          }`}
                        >
                          {m.tipo}
                        </span>
                      </td>

                      {/* Producto */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-white">{m.producto_nombre}</div>
                        <div className="font-mono text-[10px] text-slate-400">{m.producto_codigo}</div>
                      </td>

                      {/* Cantidad */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <span
                          className={`text-sm font-black ${
                            isIngreso
                              ? 'text-emerald-400'
                              : isDespacho
                              ? 'text-sky-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {isIngreso ? `+${m.cantidad}` : isDespacho ? `-${m.cantidad}` : `Δ ${m.cantidad}`}
                        </span>{' '}
                        <span className="text-[10px] text-slate-400 font-medium">{m.unidad_medida}</span>
                      </td>

                      {/* Stock Evolución */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap font-mono text-xs">
                        <span className="text-slate-400">{m.stock_anterior}</span>
                        <span className="text-slate-600 mx-1.5">→</span>
                        <span className="font-bold text-white">{m.stock_nuevo}</span>
                      </td>

                      {/* Usuario */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-300 font-medium">
                        {m.usuario_nombre}
                      </td>

                      {/* Destino / Motivo */}
                      <td className="px-4 py-3.5 text-xs text-slate-400 max-w-[200px] truncate" title={m.destino || m.motivo_ajuste || m.observacion || ''}>
                        {m.destino || m.motivo_ajuste || m.observacion || '-'}
                      </td>

                      {/* Detalle */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => setActiveMovement(m)}
                          className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition font-semibold cursor-pointer"
                        >
                          Ver Detalle
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalle de Movimiento */}
      {activeMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-[#0b1226] text-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-800">
            <div className="flex items-center justify-between px-6 py-4 bg-[#070e22] border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-white">Detalle de Operación #{activeMovement.id}</h3>
              </div>
              <button
                onClick={() => setActiveMovement(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3.5 bg-slate-900/60 rounded-2xl border border-slate-800">
                <span className="font-mono text-[10px] text-purple-400 font-bold block">{activeMovement.producto_codigo}</span>
                <h4 className="text-sm font-black text-white mt-0.5">{activeMovement.producto_nombre}</h4>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-slate-300">
                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Tipo de Operación</span>
                  <span className="font-black text-sm text-white">{activeMovement.tipo}</span>
                </div>

                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Cantidad Operada</span>
                  <span className="font-black text-sm text-emerald-400">{activeMovement.cantidad} {activeMovement.unidad_medida}</span>
                </div>

                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Stock Antes / Después</span>
                  <span className="font-mono font-bold text-white">{activeMovement.stock_anterior} → {activeMovement.stock_nuevo}</span>
                </div>

                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Fecha y Hora</span>
                  <span className="font-mono text-slate-200">{activeMovement.fecha} {activeMovement.hora}</span>
                </div>
              </div>

              <div className="p-3.5 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Usuario Responsable</span>
                  <span className="font-bold text-white">{activeMovement.usuario_nombre}</span>
                </div>

                {activeMovement.destino && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Destino / Solicitante</span>
                    <span className="font-semibold text-slate-200">{activeMovement.destino}</span>
                  </div>
                )}

                {activeMovement.motivo_ajuste && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-amber-400 block">Motivo del Ajuste</span>
                    <span className="font-semibold text-amber-300">{activeMovement.motivo_ajuste}</span>
                  </div>
                )}

                {activeMovement.observacion && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Observaciones</span>
                    <span className="text-slate-300 italic">"{activeMovement.observacion}"</span>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-3.5 bg-[#070e22] border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setActiveMovement(null)}
                className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};