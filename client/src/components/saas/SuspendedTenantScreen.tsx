import React from 'react';
import { ShieldAlert, CreditCard, LogOut, CheckCircle2, PhoneCall, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SuspendedTenantScreenProps {
  onOpenSubscriptionModal: () => void;
  companyName?: string;
  planName?: string;
}

export const SuspendedTenantScreen: React.FC<SuspendedTenantScreenProps> = ({
  onOpenSubscriptionModal,
  companyName,
  planName,
}) => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#060b17] flex items-center justify-center p-4 sm:p-6 text-slate-100 font-sans">
      <div className="max-w-xl w-full bg-[#0b1226] border border-red-500/40 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Luz de fondo decorativa roja */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Encabezado */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-red-950/80 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto shadow-lg shadow-red-950/50">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <span className="text-[11px] font-black uppercase tracking-widest text-red-400 block">
            ESTADO DE LA CUENTA EMPRESARIAL
          </span>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide">
            Suscripción Suspendida
          </h1>

          <p className="text-slate-300 text-sm font-semibold">
            Tu suscripción no está activa actualmente.
          </p>
        </div>

        {/* Tarjeta Informativa de la Empresa */}
        <div className="p-4 bg-[#080f24] rounded-2xl border border-slate-800 space-y-2 text-xs">
          <div className="flex justify-between items-center text-slate-400">
            <span>Empresa:</span>
            <strong className="text-white text-sm">{companyName || user?.empresa_nombre || 'Tu Organización'}</strong>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span>Plan contratado:</span>
            <span className="font-bold text-slate-200">{planName || user?.plan_nombre || 'Plan Profesional'}</span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span>Estado de servicio:</span>
            <span className="px-2 py-0.5 rounded-full bg-red-950/90 text-red-300 font-black text-[10px] border border-red-500/40">
              🔴 SUSPENDIDO
            </span>
          </div>
        </div>

        {/* Mensaje de resguardo y seguridad de datos (SECCIÓN 5 & 14) */}
        <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex items-start space-x-3 text-xs text-emerald-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <strong className="block text-emerald-200 font-bold mb-0.5">
              Tus datos están 100% seguros y respaldados
            </strong>
            Ningún producto, inventario, movimiento o usuario ha sido eliminado. Al renovar o regularizar el pago, tu acceso operativo se restaurará inmediatamente con toda la información intacta.
          </div>
        </div>

        {/* Instrucciones de reactivación */}
        <div className="text-xs text-slate-400 text-center space-y-1">
          <p>Contacta al administrador para renovar el servicio o regularizar tu método de pago.</p>
        </div>

        {/* Botones de Acción */}
        <div className="space-y-3 pt-2">
          <button
            onClick={onOpenSubscriptionModal}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/50 transition cursor-pointer"
          >
            <CreditCard className="w-4 h-4" />
            <span>Administrar Suscripción / Pagar en Línea</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={logout}
            className="w-full py-3 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 border border-slate-700 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </div>
    </div>
  );
};
