import React from 'react';
import {
  Package,
  QrCode,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Scale,
  AlertTriangle,
  Users,
  Layers,
  Database
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type NavSection =
  | 'almacen'
  | 'scanner'
  | 'ingresos'
  | 'despachos'
  | 'historial'
  | 'ajustes'
  | 'alertas'
  | 'usuarios';

interface SidebarProps {
  currentSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  alertCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentSection,
  onSelectSection,
  alertCount = 0,
}) => {
  const { isAdmin } = useAuth();

  const navItems: Array<{
    id: NavSection;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    adminOnly?: boolean;
    color?: string;
  }> = [
    {
      id: 'almacen',
      label: 'Almacén',
      icon: <Package className="w-5 h-5" />,
    },
    {
      id: 'scanner',
      label: 'Escáner de Códigos',
      icon: <QrCode className="w-5 h-5" />,
    },
    {
      id: 'ingresos',
      label: 'Ingresos de Productos',
      icon: <ArrowDownLeft className="w-5 h-5 text-emerald-400" />,
    },
    {
      id: 'despachos',
      label: 'Despacho de Productos',
      icon: <ArrowUpRight className="w-5 h-5 text-sky-400" />,
    },
    {
      id: 'historial',
      label: 'Historial de Movimientos',
      icon: <History className="w-5 h-5" />,
    },
    {
      id: 'ajustes',
      label: 'Ajustes de Inventario',
      icon: <Scale className="w-5 h-5 text-amber-400" />,
      adminOnly: true,
    },
    {
      id: 'alertas',
      label: 'Alertas de Stock',
      icon: <AlertTriangle className="w-5 h-5 text-rose-400" />,
      badge: alertCount,
    },
    {
      id: 'usuarios',
      label: 'Usuarios y Permisos',
      icon: <Users className="w-5 h-5" />,
      adminOnly: true,
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-screen border-r border-slate-800">
      {/* Brand / Logo */}
      <div className="p-5 border-b border-slate-800 flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-md shadow-emerald-900/30">
          <Layers className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-white font-black text-sm tracking-wider uppercase">WMS LOGÍSTICA</h1>
          <p className="text-[11px] text-slate-400 font-medium">Control de Almacén</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
          OPERACIONES
        </div>

        {navItems.map((item) => {
          if (item.adminOnly && !isAdmin) return null;

          const isActive = currentSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition group ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'hover:bg-slate-800/80 text-slate-300 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className={`${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isActive ? 'bg-white text-emerald-800' : 'bg-rose-500 text-white'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* System Status Footer */}
      <div className="p-4 border-t border-slate-800 text-[11px] text-slate-400 space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-slate-300">Sistema Conectado</span>
          </span>
          <span className="font-mono text-slate-500">v1.0.0</span>
        </div>
        <div className="flex items-center space-x-1 text-slate-500">
          <Database className="w-3.5 h-3.5 text-slate-400" />
          <span>Base de Datos SQLite (WAL)</span>
        </div>
      </div>
    </aside>
  );
};
