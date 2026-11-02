import React from 'react';
import { Scan, Building2, LogOut, CreditCard, Shield, Laptop, Palette, User as UserIcon, Database } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

interface HeaderProps {
  onOpenScanner: () => void;
  onGoHome?: () => void;
  onOpenSubscription?: () => void;
  onGoToAdminPlatform?: () => void;
  onOpenProfile?: (tab?: 'profile' | 'appearance' | 'subscription') => void;
  onOpenDevices?: () => void;
  onOpenStorage?: () => void;
  isSuperAdminView?: boolean;
  currentAreaTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenScanner,
  onGoHome,
  onOpenSubscription,
  onGoToAdminPlatform,
  onOpenProfile,
  onOpenDevices,
  onOpenStorage,
  isSuperAdminView,
}) => {
  const { user, logout, isAdmin } = useAuth();
  const { accentClasses } = useTheme();

  const userInitial = user?.nombre ? user.nombre.charAt(0).toUpperCase() : 'U';
  const isSuperAdmin = user?.rol === 'SUPERADMIN';


  return (
    <header className="h-20 bg-[#070d1d]/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-40">
      {/* Brand / Logo */}
      <div
        onClick={onGoHome}
        className="flex items-center space-x-3.5 cursor-pointer group select-none"
      >
        <div className="relative w-12 h-12 rounded-2xl p-0.5 bg-gradient-to-tr from-blue-600 via-purple-600 to-cyan-400 shadow-lg shadow-blue-500/25 group-hover:scale-105 transition duration-200 shrink-0">
          <img
            src="/logo.jpg"
            alt="LOGIXT"
            className="w-full h-full object-cover rounded-[14px]"
          />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <div className="text-white font-black text-xl tracking-wider flex items-center">
              <span>LOGI</span>
              <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">X</span>
              <span>T</span>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
              SaaS Multi-Tenant
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            Sistema SaaS de Gestión de Almacenes
          </p>
        </div>
      </div>

      {/* Right Area: Warehouse badge, Scanner button, Subscription button, User info & Logout */}
      <div className="flex items-center space-x-2.5 sm:space-x-4">
        {/* Selector / Indicador de Empresa o Almacén Central */}
        <div className="hidden lg:flex items-center space-x-2 px-3.5 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300">
          <Building2 className="w-4 h-4 text-blue-400" />
          <span className="max-w-[170px] truncate">
            {user?.empresa_nombre || 'Almacén Central'}
          </span>
        </div>

        {/* Botón de Escáner Rápido */}
        <button
          onClick={onOpenScanner}
          className="flex items-center space-x-2 px-3 py-2 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition shadow-sm cursor-pointer"
          title="Abrir escáner de cámara o conectar lector"
        >
          <Scan className="w-4 h-4 text-blue-400" />
          <span className="hidden sm:inline">Escanear</span>
        </button>

        {/* Botón Dispositivos (para empresas) */}
        {!isSuperAdmin && onOpenDevices && (
          <button
            onClick={onOpenDevices}
            className="flex items-center space-x-2 px-3 py-2 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition shadow-sm cursor-pointer"
            title="Terminales y Dispositivos de la Empresa"
          >
            <Laptop className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Dispositivos</span>
          </button>
        )}

        {/* Botón Almacenamiento y Copias de Seguridad */}
        {onOpenStorage && (
          <button
            onClick={onOpenStorage}
            className="flex items-center space-x-2 px-3 py-2 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition shadow-sm cursor-pointer"
            title="Almacenamiento Local, Sincronización y Respaldos"
          >
            <Database className="w-4 h-4 text-emerald-400" />
            <span className="hidden md:inline">Almacenamiento</span>
          </button>
        )}

        {/* Botón Mi Suscripción (para empresas) */}
        {!isSuperAdmin && onOpenSubscription && (
          <button
            onClick={onOpenSubscription}
            className="flex items-center space-x-2 px-3.5 py-2 bg-purple-950/70 hover:bg-purple-900/80 border border-purple-500/40 rounded-xl text-xs font-bold text-purple-300 transition shadow-sm cursor-pointer"
            title="Ver estado de suscripción, facturación y pagos"
          >
            <CreditCard className="w-4 h-4 text-purple-400" />
            <span className="hidden sm:inline">Mi Suscripción</span>
          </button>
        )}

        {/* Botón Switcher SuperAdmin (si es SUPERADMIN) */}
        {isSuperAdmin && onGoToAdminPlatform && (
          <button
            onClick={onGoToAdminPlatform}
            className="flex items-center space-x-2 px-3.5 py-2 bg-gradient-to-r from-purple-700 to-indigo-600 hover:from-purple-600 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition shadow-md shadow-purple-950/40 cursor-pointer"
            title="Ir al Panel de Administración de Plataforma"
          >
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">Plataforma SaaS</span>
          </button>
        )}

        {/* Botón Personalización de Apariencia */}
        {onOpenProfile && (
          <button
            onClick={() => onOpenProfile('appearance')}
            className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-900/80 rounded-xl border border-transparent hover:border-slate-800 transition cursor-pointer"
            title="Personalizar tema, apariencia y colores"
          >
            <Palette className="w-4 h-4" />
          </button>
        )}

        {/* Separador */}
        <div className="h-8 w-px bg-slate-800/80 hidden sm:block" />

        {/* Info y Avatar de Usuario (Clickable para abrir Perfil) */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => onOpenProfile?.('profile')}
            className="flex items-center space-x-3 p-1 -m-1 rounded-xl hover:bg-slate-800/50 transition cursor-pointer group text-left"
            title="Ver y editar perfil de usuario"
          >
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-100 group-hover:text-blue-400 transition leading-tight">
                {user?.nombre} {user?.apellido || ''}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Rol:{' '}
                <span
                  className={`font-semibold ${
                    isSuperAdmin
                      ? 'text-purple-400'
                      : isAdmin
                      ? 'text-blue-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {user?.rol === 'SUPERADMIN'
                    ? 'SuperAdmin'
                    : user?.rol === 'ADMINISTRADOR'
                    ? 'Administrador'
                    : 'Almacenero'}
                </span>
              </p>
            </div>

            {/* Avatar (Foto o Inicial con borde y estilo de acento) */}
            <div className={`w-9 h-9 rounded-xl bg-slate-800 border ${accentClasses.border} flex items-center justify-center text-xs font-black ${accentClasses.text} select-none shadow-sm overflow-hidden group-hover:scale-105 group-hover:shadow-md transition`}>
              {user?.foto ? (
                <img
                  src={user.foto}
                  alt={user?.nombre || 'Usuario'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{userInitial}</span>
              )}
            </div>
          </button>

          {/* Botón Salir */}
          <button
            onClick={logout}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-900/80 rounded-xl border border-transparent hover:border-slate-800 transition cursor-pointer"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
