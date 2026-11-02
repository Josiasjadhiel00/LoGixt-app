import React from 'react';
import {
  Box,
  ArrowDown,
  ArrowUp,
  LayoutGrid,
  History,
  Package,
  AlertTriangle,
  Tags,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { DashboardSummary } from '../types';

export type MainArea = 'almacen' | 'ingreso' | 'despacho';
export type SubAreaOption =
  | 'almacen-dashboard'
  | 'almacen-movimientos'
  | 'almacen-productos'
  | 'almacen-alertas'
  | 'ingreso-categorias'
  | 'ingreso-flujo'
  | 'despacho-flujo';

interface HubMainProps {
  summary: DashboardSummary | null;
  onNavigateArea: (area: MainArea, subOption?: SubAreaOption) => void;
}

export const HubMain: React.FC<HubMainProps> = ({ summary, onNavigateArea }) => {
  const totalAlerts =
    (summary?.kpis.stock_bajo || 0) + (summary?.kpis.agotados || 0);

  return (
    <div className="flex-1 flex flex-col justify-between py-6 sm:py-10 px-4 sm:px-8 max-w-7xl mx-auto w-full">
      {/* 1. Header Centrado */}
      <div className="text-center space-y-3 mb-8 sm:mb-12">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-950/70 border border-blue-800/40 text-blue-300 text-xs font-semibold shadow-inner">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span>Centro de Operaciones Logísticas</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
          ¿Qué necesitas hacer hoy?
        </h1>

        <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto font-normal leading-relaxed">
          Selecciona una de las tres áreas principales para gestionar el inventario, registrar
          recepciones de mercancía o despachar productos.
        </p>
      </div>

      {/* 2. Las Tres Grandes Tarjetas Principales (En fila horizontal) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-7 items-stretch">
        {/* TARJETA 1: ALMACÉN */}
        <div
          onClick={() => onNavigateArea('almacen')}
          className="group bg-[#0b1226] hover:bg-[#0d1630] border border-[#172547] hover:border-blue-500/50 rounded-3xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-blue-950/50 cursor-pointer relative overflow-hidden"
        >
          {/* Subtle Top Glow */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <div>
            {/* Header de Tarjeta */}
            <div className="flex items-center justify-between">
              <div className="w-13 h-13 rounded-2xl bg-[#132047] border border-[#1e3473] flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform duration-200">
                <Box className="w-7 h-7" />
              </div>
              <span className="text-xs font-bold text-blue-400 group-hover:text-blue-300 flex items-center space-x-1">
                <span>Acceder</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
            </div>

            {/* Título y Descripción */}
            <h2 className="text-2xl font-black text-white tracking-wide mt-5">
              ALMACÉN
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
              Control y consulta de las existencias del almacén.
            </p>

            {/* Sub-opciones */}
            <div className="mt-8 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-3">
                OPCIONES DISPONIBLES
              </span>

              {/* Opción: Dashboard */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateArea('almacen', 'almacen-dashboard');
                }}
                className="flex items-center justify-between p-3 rounded-xl bg-[#080e20] hover:bg-[#121c3d] border border-[#152345] hover:border-blue-500/40 text-slate-200 hover:text-white transition group/item"
              >
                <div className="flex items-center space-x-3">
                  <LayoutGrid className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold">Dashboard</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover/item:translate-x-0.5 group-hover/item:text-blue-400 transition" />
              </div>

              {/* Opción: Movimientos */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateArea('almacen', 'almacen-movimientos');
                }}
                className="flex items-center justify-between p-3 rounded-xl bg-[#080e20] hover:bg-[#121c3d] border border-[#152345] hover:border-blue-500/40 text-slate-200 hover:text-white transition group/item"
              >
                <div className="flex items-center space-x-3">
                  <History className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold">Movimientos</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover/item:translate-x-0.5 group-hover/item:text-blue-400 transition" />
              </div>

              {/* Opción: Productos */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateArea('almacen', 'almacen-productos');
                }}
                className="flex items-center justify-between p-3 rounded-xl bg-[#080e20] hover:bg-[#121c3d] border border-[#152345] hover:border-blue-500/40 text-slate-200 hover:text-white transition group/item"
              >
                <div className="flex items-center space-x-3">
                  <Package className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold">Productos</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover/item:translate-x-0.5 group-hover/item:text-blue-400 transition" />
              </div>

              {/* Opción: Alertas */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateArea('almacen', 'almacen-alertas');
                }}
                className="flex items-center justify-between p-3 rounded-xl bg-[#080e20] hover:bg-[#121c3d] border border-[#152345] hover:border-amber-500/40 text-slate-200 hover:text-white transition group/item"
              >
                <div className="flex items-center space-x-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold">Alertas</span>
                </div>
                <div className="flex items-center space-x-2">
                  {totalAlerts > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {totalAlerts} pendientes
                    </span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover/item:translate-x-0.5 group-hover/item:text-amber-400 transition" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* TARJETA 2: INGRESO */}
        <div
          onClick={() => onNavigateArea('ingreso')}
          className="group bg-[#0b1226] hover:bg-[#0d1630] border border-[#172547] hover:border-emerald-500/50 rounded-3xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-emerald-950/50 cursor-pointer relative overflow-hidden"
        >
          {/* Subtle Top Glow */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <div>
            {/* Header de Tarjeta */}
            <div className="flex items-center justify-between">
              <div className="w-13 h-13 rounded-2xl bg-[#0d2a23] border border-[#144f42] flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform duration-200">
                <ArrowDown className="w-7 h-7" />
              </div>
              <span className="text-xs font-bold text-emerald-400 group-hover:text-emerald-300 flex items-center space-x-1">
                <span>Acceder</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
            </div>

            {/* Título y Descripción */}
            <h2 className="text-2xl font-black text-white tracking-wide mt-5">
              INGRESO
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
              Registra los productos que ingresan al almacén.
            </p>

            {/* Sub-opciones */}
            <div className="mt-8 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-3">
                OPCIONES DISPONIBLES
              </span>

              {/* Opción: Categorías */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateArea('ingreso', 'ingreso-categorias');
                }}
                className="flex items-center justify-between p-3 rounded-xl bg-[#080e20] hover:bg-[#0d2621] border border-[#152345] hover:border-emerald-500/40 text-slate-200 hover:text-white transition group/item"
              >
                <div className="flex items-center space-x-3">
                  <Tags className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold">Categorías</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover/item:translate-x-0.5 group-hover/item:text-emerald-400 transition" />
              </div>

              {/* Opción: Ingreso de Producto (Destacada) */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateArea('ingreso', 'ingreso-flujo');
                }}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-[#071d18]/90 hover:bg-[#0b2b24] border border-emerald-500/30 hover:border-emerald-400/60 transition group/item shadow-inner"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-950 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mt-0.5">
                    <ArrowDown className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-emerald-400 block">
                      Ingreso de producto
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Flujo rápido: Escanear → Cantidad → Confirmar
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-emerald-500/70 group-hover/item:translate-x-0.5 group-hover/item:text-emerald-300 transition" />
              </div>
            </div>
          </div>
        </div>

        {/* TARJETA 3: DESPACHO */}
        <div
          onClick={() => onNavigateArea('despacho')}
          className="group bg-[#0b1226] hover:bg-[#0d1630] border border-[#172547] hover:border-sky-500/50 rounded-3xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-sky-950/50 cursor-pointer relative overflow-hidden"
        >
          {/* Subtle Top Glow */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-sky-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <div>
            {/* Header de Tarjeta */}
            <div className="flex items-center justify-between">
              <div className="w-13 h-13 rounded-2xl bg-[#0f2347] border border-[#163f82] flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform duration-200">
                <ArrowUp className="w-7 h-7" />
              </div>
              <span className="text-xs font-bold text-sky-400 group-hover:text-sky-300 flex items-center space-x-1">
                <span>Acceder</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
            </div>

            {/* Título y Descripción */}
            <h2 className="text-2xl font-black text-white tracking-wide mt-5">
              DESPACHO
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
              Registra los productos que salen del almacén.
            </p>

            {/* Sub-opciones */}
            <div className="mt-8 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-3">
                OPCIONES DISPONIBLES
              </span>

              {/* Opción: Despacho de Producto (Destacada) */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateArea('despacho', 'despacho-flujo');
                }}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-[#091d38]/90 hover:bg-[#0e2c54] border border-sky-500/30 hover:border-sky-400/60 transition group/item shadow-inner"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-7 h-7 rounded-lg bg-sky-950 border border-sky-500/30 flex items-center justify-center text-sky-400 mt-0.5">
                    <ArrowUp className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-sky-400 block">
                      Despacho de productos
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Flujo: Escanear → Cantidad → Destino → Confirmar
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-sky-500/70 group-hover/item:translate-x-0.5 group-hover/item:text-sky-300 transition" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Footer de Estado del Sistema */}
      <div className="mt-12 pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-3">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-slate-300">Sistema Operativo</span>
          <span>·</span>
          <span>
            {summary?.kpis.total_productos ?? 0} referencias registradas
          </span>
          <span>·</span>
          <span>
            <strong className="text-slate-200">
              {summary?.kpis.total_existencias ?? 0}
            </strong>{' '}
            unidades en inventario
          </span>
        </div>

        <div className="text-slate-500 font-mono">
          Control de inventario de alta precisión · v2.4 Enterprise
        </div>
      </div>
    </div>
  );
};
