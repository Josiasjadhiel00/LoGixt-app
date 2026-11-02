import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  LayoutGrid,
  History,
  Package,
  AlertTriangle,
  Scale,
  Plus
} from 'lucide-react';
import { Dashboard } from './Dashboard';
import { HistoryPage } from './HistoryPage';
import { AlertsPage } from './AlertsPage';
import { Product } from '../types';
import { useAuth } from '../context/AuthContext';

export type AlmacenTab = 'dashboard' | 'movimientos' | 'productos' | 'alertas' | 'ajustes';

interface AlmacenViewProps {
  initialTab?: AlmacenTab;
  onGoBack: () => void;
  onOpenInbound: (product?: Product) => void;
  onOpenOutbound: (product?: Product) => void;
  onOpenAdjust: (product?: Product) => void;
  onOpenNewProduct: () => void;
  onOpenEditProduct: (product: Product) => void;
  onOpenLabel: (product: Product) => void;
  refreshKey: number;
}

export const AlmacenView: React.FC<AlmacenViewProps> = ({
  initialTab = 'dashboard',
  onGoBack,
  onOpenInbound,
  onOpenOutbound,
  onOpenAdjust,
  onOpenNewProduct,
  onOpenEditProduct,
  onOpenLabel,
  refreshKey,
}) => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<AlmacenTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full py-4 sm:py-6 px-4 sm:px-6">
      {/* Barra de Navegación Superior de ALMACÉN */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <button
            onClick={onGoBack}
            className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-300 transition group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform text-blue-400" />
            <span>Centro de Operaciones</span>
          </button>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 block">
              ÁREA PRINCIPAL
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide">
              📦 Almacén y Control de Existencias
            </h1>
          </div>
        </div>

        {/* Pestañas de Navegación del Área */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#090f23] border border-slate-800 rounded-2xl">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'dashboard'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('productos')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'productos'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Productos</span>
          </button>

          <button
            onClick={() => setActiveTab('movimientos')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'movimientos'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Movimientos</span>
          </button>

          <button
            onClick={() => setActiveTab('alertas')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'alertas'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Alertas</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => onOpenAdjust()}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
              title="Ajuste manual de inventario"
            >
              <Scale className="w-3.5 h-3.5 text-amber-400" />
              <span>Ajustes</span>
            </button>
          )}
        </div>
      </div>

      {/* Contenido según pestaña seleccionada */}
      <div className="pt-2">
        {activeTab === 'dashboard' && (
          <Dashboard
            onOpenInbound={onOpenInbound}
            onOpenOutbound={onOpenOutbound}
            onOpenNewProduct={onOpenNewProduct}
            onOpenEditProduct={onOpenEditProduct}
            onOpenLabel={onOpenLabel}
            onNavigateSection={(sec) => {
              if (sec === 'historial') setActiveTab('movimientos');
              if (sec === 'alertas') setActiveTab('alertas');
            }}
            refreshKey={refreshKey}
          />
        )}

        {activeTab === 'productos' && (
          <Dashboard
            onOpenInbound={onOpenInbound}
            onOpenOutbound={onOpenOutbound}
            onOpenNewProduct={onOpenNewProduct}
            onOpenEditProduct={onOpenEditProduct}
            onOpenLabel={onOpenLabel}
            onNavigateSection={(sec) => {
              if (sec === 'historial') setActiveTab('movimientos');
              if (sec === 'alertas') setActiveTab('alertas');
            }}
            refreshKey={refreshKey}
          />
        )}

        {activeTab === 'movimientos' && <HistoryPage />}

        {activeTab === 'alertas' && (
          <AlertsPage onOpenInbound={onOpenInbound} refreshKey={refreshKey} />
        )}
      </div>
    </div>
  );
};
