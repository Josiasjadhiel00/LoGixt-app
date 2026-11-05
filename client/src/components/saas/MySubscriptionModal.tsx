import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  AlertTriangle,
  XCircle,
  MessageCircle,
  Clock,
  Calendar,
  Layers,
  Users,
  Building,
  Check,
  X,
  RefreshCw,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { api } from '../../services/api';

interface MySubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MySubscriptionModal: React.FC<MySubscriptionModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.subscriptions.getMySubscription();
      setData(res);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error cargando suscripción.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const sub = data?.subscription;
  const payments = data?.payments || [];

  const isSuspended =
    sub?.empresa_estado === 'SUSPENDIDA' ||
    sub?.suscripcion_estado === 'SUSPENDED' ||
    sub?.suscripcion_estado === 'CANCELED';

  const isPastDue = sub?.suscripcion_estado === 'PAST_DUE' || sub?.en_periodo_gracia;
  const whatsappNumber = (import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const whatsappMessage = encodeURIComponent(
    [
      'Hola, quiero recibir los datos para pagar manualmente mi suscripción de Logixt.',
      `Empresa: ${sub?.empresa_nombre || 'No especificada'}`,
      `Plan: ${sub?.plan_nombre || 'No especificado'}`,
      sub?.plan_precio != null ? `Monto: $${sub.plan_precio} USD` : null,
    ].filter(Boolean).join('\n')
  );
  const whatsappUrl = /^\d{8,15}$/.test(whatsappNumber)
    ? `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in font-sans">
      <div className="bg-[#0b1226] border border-[#172547] rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-scale-in">
        {/* Header del Modal */}
        <div className="px-6 py-5 bg-[#070e22] border-b border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-950/80 border border-blue-500/30 text-blue-400 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 block">
                GESTIÓN COMERCIAL
              </span>
              <h2 className="text-lg font-black text-white">Mi Suscripción y Facturación</h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-300 text-xs">
          {loading ? (
            <div className="text-center py-16 text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-2" />
              <span>Consultando información del plan y pagos...</span>
            </div>
          ) : (
            <>
              {/* Alertas de Notificación */}
              {errorMessage && (
                <div className="p-4 bg-red-950/80 border border-red-500/50 rounded-2xl flex items-center space-x-3 text-red-300 text-xs font-semibold shadow-lg">
                  <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <span className="flex-1">{errorMessage}</span>
                </div>
              )}

              {/* 1. ESTADO DE LA SUSCRIPCIÓN (SECCIÓN 12) */}
              <div className="bg-[#080f24] rounded-3xl p-5 border border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      EMPRESA ABONADA
                    </span>
                    <h3 className="text-base font-black text-white mt-0.5">
                      {sub?.empresa_nombre || 'Tu Organización'}
                    </h3>
                  </div>

                  {/* Badges de Estado */}
                  <div>
                    {isSuspended ? (
                      <span className="px-3 py-1 rounded-full bg-red-950/90 text-red-300 border border-red-500/40 text-xs font-black tracking-wider flex items-center space-x-1.5 shadow">
                        <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                        <span>🔴 SUSPENDIDA</span>
                      </span>
                    ) : isPastDue ? (
                      <span className="px-3 py-1 rounded-full bg-amber-950/90 text-amber-300 border border-amber-500/40 text-xs font-black tracking-wider flex items-center space-x-1.5 shadow">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        <span>🟡 PAGO PENDIENTE (EN GRACIA)</span>
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 text-xs font-black tracking-wider flex items-center space-x-1.5 shadow">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>🟢 ACTIVA</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Banner de Aviso de Período de Gracia o Suspensión */}
                {isPastDue && !isSuspended && (
                  <div className="p-3.5 bg-amber-950/60 border border-amber-500/40 rounded-2xl flex items-start space-x-3 text-amber-300">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-black text-amber-200">
                        Período de Gracia Activo — {sub?.dias_gracia_restantes} días restantes
                      </strong>
                      Tu fecha de pago venció el {sub?.fecha_proximo_pago}. Puedes continuar operando durante el período de gracia. Renueva tu suscripción para evitar la suspensión del acceso.
                    </div>
                  </div>
                )}

                {isSuspended && (
                  <div className="p-3.5 bg-red-950/60 border border-red-500/40 rounded-2xl flex items-start space-x-3 text-red-300">
                    <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-black text-red-200">
                        Acceso Operativo Suspendido
                      </strong>
                      Se superó el período de gracia. Todos tus datos están protegidos. Haz clic en el botón de pago abajo para reactivar inmediatamente el almacén.
                    </div>
                  </div>
                )}

                {/* Tarjetas de Métricas del Plan */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 bg-slate-900/80 rounded-2xl border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Plan Actual
                    </span>
                    <span className="text-base font-black text-white">
                      {sub?.plan_nombre || 'Plan Profesional'}
                    </span>
                    <span className="block text-[11px] text-emerald-400 font-bold mt-0.5">
                      ${sub?.plan_precio || 79} USD / {sub?.plan_periodo?.toLowerCase() || 'mes'}
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-900/80 rounded-2xl border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Próximo Vencimiento
                    </span>
                    <span className="text-base font-black text-white">
                      {sub?.fecha_proximo_pago || 'No disponible'}
                    </span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">
                      Facturación recurrente
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-900/80 rounded-2xl border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Límite de Usuarios
                    </span>
                    <span className="text-base font-black text-white">
                      {sub?.uso?.usuarios_activos || 0} / {sub?.max_usuarios || 10}
                    </span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">
                      Usuarios operativos activos
                    </span>
                  </div>
                </div>

                {/* Características del Plan */}
                {sub?.caracteristicas && sub.caracteristicas.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      Funciones Incluidas en tu Plan:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {sub.caracteristicas.map((c: string, idx: number) => (
                        <div key={idx} className="flex items-center space-x-2 text-slate-300">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Solicitud de instrucciones para pago manual */}
              <div className="p-4 bg-gradient-to-r from-[#0c1e36] to-[#0a232e] rounded-3xl border border-blue-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="font-black text-white text-sm">Pago manual por WhatsApp</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Solicita por WhatsApp los datos de cuenta y envía tu comprobante. La suscripción se actualizará después de confirmar el pago.
                  </p>
                </div>
                {whatsappUrl ? (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl inline-flex items-center gap-2 shadow-xl shadow-emerald-950/50 transition shrink-0"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Solicitar datos por WhatsApp
                  </a>
                ) : (
                  <span className="px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-950/40 text-amber-300 text-[10px] font-black uppercase tracking-wider shrink-0">
                    WhatsApp no configurado
                  </span>
                )}
              </div>

              {/* 2. HISTORIAL DE PAGOS (SECCIÓN 12) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-white text-xs uppercase tracking-wider">
                    Historial de Recibos y Pagos
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {payments.length} transacciones registradas
                  </span>
                </div>

                {payments.length === 0 ? (
                  <div className="p-6 bg-[#080f24] rounded-2xl border border-slate-800 text-center text-slate-500 text-xs">
                    No se registran pagos previos para esta empresa.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-800">
                    <table className="w-full text-left text-slate-300">
                      <thead className="bg-[#070e22] text-slate-400 uppercase text-[9px] tracking-wider font-bold">
                        <tr>
                          <th className="px-3.5 py-2.5">ID Transacción</th>
                          <th className="px-3.5 py-2.5">Fecha</th>
                          <th className="px-3.5 py-2.5">Método</th>
                          <th className="px-3.5 py-2.5 text-right">Monto</th>
                          <th className="px-3.5 py-2.5 text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 bg-[#080f24] text-[11px]">
                        {payments.map((p: any) => (
                          <tr key={p.id} className="hover:bg-slate-900/60">
                            <td className="px-3.5 py-2.5 font-mono text-slate-400">
                              {p.payment_id}
                            </td>
                            <td className="px-3.5 py-2.5">
                              {p.fecha_pago ? p.fecha_pago.slice(0, 16).replace('T', ' ') : '-'}
                            </td>
                            <td className="px-3.5 py-2.5 text-slate-400">
                              {p.metodo_pago || 'TARJETA'}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-bold text-white">
                              ${p.monto.toFixed(2)} {p.moneda}
                            </td>
                            <td className="px-3.5 py-2.5 text-center">
                              {p.estado === 'PAGADO' ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30 text-[9px] font-black">
                                  PAGADO
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-500/30 text-[9px] font-black">
                                  FALLIDO
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#070e22] border-t border-slate-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
