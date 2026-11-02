import React, { useState, useEffect } from 'react';
import {
  Laptop,
  Tablet,
  Monitor,
  Smartphone,
  Plus,
  CheckCircle2,
  AlertTriangle,
  X,
  Clock,
  Shield,
  RefreshCw,
  Key,
  Info
} from 'lucide-react';
import { api } from '../../services/api';
import { sound } from '../../services/sound';
import { Dispositivo } from '../../types';
import { useTheme } from '../../context/ThemeContext';

interface CompanyDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CompanyDevicesModal: React.FC<CompanyDevicesModalProps> = ({ isOpen, onClose }) => {
  const { accentClasses } = useTheme();

  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [maxDispositivos, setMaxDispositivos] = useState(1);
  const [activosCount, setActivosCount] = useState(0);
  const [limiteAlcanzado, setLimiteAlcanzado] = useState(false);
  const [planNombre, setPlanNombre] = useState('Básico');
  const [loading, setLoading] = useState(true);

  // Formulario de Activación de Código
  const [isActivating, setIsActivating] = useState(false);
  const [codigoInput, setCodigoInput] = useState('');
  const [nombreInput, setNombreInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadDevices();
      detectCurrentDevice();
    }
  }, [isOpen]);

  const detectCurrentDevice = () => {
    const ua = navigator.userAgent;
    let detectedName = 'Equipo Logixt';
    if (/android/i.test(ua)) {
      detectedName = 'Tablet Android';
    } else if (/iPad|iPhone/i.test(ua)) {
      detectedName = 'Dispositivo iOS';
    } else if (/windows/i.test(ua)) {
      detectedName = 'PC Windows';
    } else if (/mac/i.test(ua)) {
      detectedName = 'Mac / Laptop';
    }
    setNombreInput(detectedName);
  };

  const loadDevices = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.devices.getMyDevices();
      setDispositivos(res.dispositivos);
      setMaxDispositivos(res.max_dispositivos);
      setActivosCount(res.activos_count);
      setLimiteAlcanzado(res.limite_alcanzado);
      setPlanNombre(res.plan_nombre);
    } catch (e: any) {
      setErrorMsg(e.message || 'Error al cargar dispositivos.');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigoInput.trim()) return;

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Detectar OS y tipo
    const ua = navigator.userAgent;
    let tipo = 'PC';
    if (/tablet|ipad/i.test(ua) || (window.innerWidth >= 600 && window.innerWidth <= 1024)) {
      tipo = 'Tablet';
    } else if (/mobile|android/i.test(ua)) {
      tipo = 'Tablet';
    } else if (/windows|mac|linux/i.test(ua)) {
      tipo = 'PC';
    }

    try {
      const res = await api.devices.activateWithCode({
        codigo: codigoInput.trim().toUpperCase(),
        nombre: nombreInput.trim() || undefined,
        tipo,
        sistema_operativo: navigator.platform || 'N/A',
        version_logixt: 'v1.0.4'
      });

      sound.playSuccess();
      setSuccessMsg(res.message);
      setCodigoInput('');
      setIsActivating(false);
      await loadDevices();
    } catch (err: any) {
      sound.playError();
      setErrorMsg(err.message || 'Error al activar el dispositivo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const getDeviceIcon = (tipo: string) => {
    switch (tipo) {
      case 'Tablet':
        return <Tablet className="w-5 h-5 text-purple-400" />;
      case 'Laptop':
        return <Laptop className="w-5 h-5 text-blue-400" />;
      case 'Otro':
        return <Smartphone className="w-5 h-5 text-emerald-400" />;
      case 'PC':
      default:
        return <Monitor className="w-5 h-5 text-cyan-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in font-sans">
      <div className="bg-[#0b1226] border border-[#172547] rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-scale-in">
        {/* Cabecera */}
        <div className="px-6 py-5 bg-[#070e22] border-b border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${accentClasses.gradient} flex items-center justify-center text-white shadow-lg ${accentClasses.shadow}`}>
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <span className={`text-[10px] font-black uppercase tracking-wider ${accentClasses.text} block`}>
                Dispositivos de la Empresa
              </span>
              <h2 className="text-lg font-black text-white">Gestión de Dispositivos</h2>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Contador de Consumo */}
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs">
              <span className="text-slate-400">Cupos:</span>
              <span className={`font-black ${activosCount >= maxDispositivos ? 'text-amber-400' : 'text-emerald-400'}`}>
                {activosCount} / {maxDispositivos}
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">({planNombre})</span>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mensajes de Notificación */}
        {errorMsg && (
          <div className="px-6 py-3 bg-rose-950/80 text-rose-300 border-b border-rose-800 text-xs font-semibold flex items-center space-x-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="px-6 py-3 bg-emerald-950/80 text-emerald-300 border-b border-emerald-800 text-xs font-semibold flex items-center space-x-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Cuerpo del Modal */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Banner de Límite y Acción de Activación */}
          <div className="p-5 rounded-2xl bg-[#0e172e] border border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-black text-white">Dispositivos Autorizados por tu Plan</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Tu empresa cuenta con licencia para <strong className="text-white">{maxDispositivos} dispositivo{maxDispositivos > 1 ? 's' : ''}</strong> en el {planNombre}.
              </p>
              {limiteAlcanzado && (
                <p className="text-[11px] text-amber-400 font-semibold mt-1 flex items-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Has alcanzado el límite de dispositivos de tu plan.</span>
                </p>
              )}
            </div>

            <button
              onClick={() => {
                setIsActivating(!isActivating);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              disabled={limiteAlcanzado}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition flex items-center space-x-2 shadow-lg cursor-pointer shrink-0 ${
                limiteAlcanzado
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : `${accentClasses.bg} ${accentClasses.hoverBg} text-white ${accentClasses.shadow}`
              }`}
            >
              <Key className="w-4 h-4" />
              <span>{isActivating ? 'Cerrar Activación' : '+ Vincular Este Dispositivo'}</span>
            </button>
          </div>

          {/* Formulario de Activación mediante Código LGX-XXXX-XXXX */}
          {isActivating && (
            <form onSubmit={handleActivate} className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-[#080e22] border border-blue-500/30 space-y-4 animate-scale-in">
              <div className="flex items-center space-x-2 text-xs font-black text-blue-400">
                <Key className="w-4 h-4" />
                <span>Introduce el Código de Activación Entregado por el Administrador</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                    Código de Activación (Temporal)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="LGX-7F4K-29PX"
                    value={codigoInput}
                    onChange={(e) => setCodigoInput(e.target.value.toUpperCase())}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono tracking-widest text-center text-white uppercase focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Formato: LGX-XXXX-XXXX (Uso único de 48 horas).
                  </span>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                    Nombre Descriptivo de este Dispositivo
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Tablet Almacén Principal"
                    value={nombreInput}
                    onChange={(e) => setNombreInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Identificará a este equipo en los reportes de actividad.
                  </span>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsActivating(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-5 py-2 ${accentClasses.bg} ${accentClasses.hoverBg} text-white rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-md cursor-pointer`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{submitting ? 'Validando Código...' : 'Confirmar y Vincular'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Listado de Dispositivos Registrados */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-white uppercase tracking-wider">
              Dispositivos Vinculados Actualmente ({dispositivos.length})
            </h4>

            {loading ? (
              <div className="py-12 flex justify-center items-center">
                <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : dispositivos.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
                <Laptop className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-300">No hay dispositivos vinculados aún</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Usa el botón "+ Vincular Este Dispositivo" con el código que te entregó el SuperAdmin para comenzar.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dispositivos.map((d) => (
                  <div
                    key={d.id}
                    className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition flex items-start space-x-3.5"
                  >
                    <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                      {getDeviceIcon(d.tipo)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black text-white truncate" title={d.nombre}>
                          {d.nombre}
                        </h5>
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            d.estado === 'ACTIVO'
                              ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                              : d.estado === 'BLOQUEADO'
                              ? 'bg-rose-950/80 text-rose-400 border-rose-500/40'
                              : 'bg-amber-950/80 text-amber-400 border-amber-500/40'
                          }`}
                        >
                          {d.estado}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {d.tipo} · {d.sistema_operativo || 'Desconocido'}
                      </p>

                      <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>
                            {d.ultima_conexion ? `Conectado: ${new Date(d.ultima_conexion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Sin conexión'}
                          </span>
                        </span>
                        <span className="font-mono text-slate-400">
                          {d.version_logixt || 'v1.0.4'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nota Informativa */}
          <div className="p-3.5 bg-slate-900/40 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-start space-x-2.5">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Cada dispositivo vinculado consume un cupo asignado según el plan de suscripción de tu empresa. La desactivación o desvinculación de un equipo libera inmediatamente el cupo para registrar otro dispositivo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
