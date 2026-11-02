import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Cloud,
  FolderOpen,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  Database,
  Lock,
  Layers,
  Clock,
  Cpu
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../services/api';
import { sound } from '../../services/sound';
import {
  requestLocalDirectory,
  getStorageQuota,
  requestPersistentStorage,
  getDeviceUuid,
  getSavedLocalFolderName
} from '../../services/localStorageDb';
import { StorageMode, LocalStorageType, BackupFrequency } from '../../types';

interface StorageSetupWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  isInitialSetup?: boolean;
}

export const StorageSetupWizardModal: React.FC<StorageSetupWizardModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  isInitialSetup = true
}) => {
  const { user, updateUser } = useAuth();
  const { accentClasses } = useTheme();

  const [step, setStep] = useState<number>(1);
  const [modo, setModo] = useState<StorageMode>('LOCAL_SYNC');
  const [tipoLocal, setTipoLocal] = useState<LocalStorageType>('INDEXEDDB');
  const [nombreCarpeta, setNombreCarpeta] = useState<string>(getSavedLocalFolderName() || '');
  const [frecuencia, setFrecuencia] = useState<BackupFrequency>('MANUAL');
  const [autoSincronizar, setAutoSincronizar] = useState<boolean>(true);

  // Cuota y estado del sistema
  const [quotaInfo, setQuotaInfo] = useState<{
    usageBytes: number;
    quotaBytes: number;
    usagePercent: number;
    isPersistent: boolean;
  } | null>(null);

  const [fsPickerSupported, setFsPickerSupported] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Verificar si showDirectoryPicker existe
      setFsPickerSupported(typeof window !== 'undefined' && Boolean((window as any).showDirectoryPicker));
      loadQuota();
      // Solicitar persistencia del almacenamiento
      requestPersistentStorage();
    }
  }, [isOpen]);

  const loadQuota = async () => {
    const q = await getStorageQuota();
    setQuotaInfo(q);
  };

  const handleSelectFolder = async () => {
    setErrorMsg(null);
    setIsProcessing(true);
    try {
      const res = await requestLocalDirectory();
      if (res.granted && res.folderName) {
        setNombreCarpeta(res.folderName);
        setTipoLocal('DIRECTORIO_LOCAL');
        sound.playSuccess();
      } else if (res.error) {
        setErrorMsg(res.error);
        setTipoLocal('INDEXEDDB');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo seleccionar la carpeta.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinishConfiguration = async () => {
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const deviceUuid = getDeviceUuid();

      await api.storage.saveConfig({
        dispositivo_uuid: deviceUuid,
        modo,
        tipo_almacenamiento_local: tipoLocal,
        nombre_carpeta_local: nombreCarpeta || (tipoLocal === 'DIRECTORIO_LOCAL' ? 'Carpeta Local Seleccionada' : 'Almacenamiento Seguro del Navegador'),
        auto_sincronizar: autoSincronizar,
        frecuencia_respaldo: frecuencia,
        cifrado_activo: false,
        bytes_utilizados_local: quotaInfo?.usageBytes || 0
      });

      updateUser({
        almacenamiento_configurado: true,
        almacenamiento_modo: modo
      });

      sound.playSuccess();
      setSuccessMsg('¡Configuración de almacenamiento activada exitosamente!');
      setTimeout(() => {
        onComplete();
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar la configuración de almacenamiento.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-2xl bg-[#080f24] border border-blue-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-blue-950/60 relative overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Glow de ambientación */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Encabezado del Asistente */}
        <div className="border-b border-slate-800 pb-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-950/50">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">
                  {isInitialSetup ? 'ASISTENTE DE CONFIGURACIÓN INICIAL' : 'CONFIGURACIÓN DE ALMACENAMIENTO'}
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white">
                  Almacenamiento y Sincronización
                </h2>
              </div>
            </div>

            {!isInitialSetup && (
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Stepper horizontal */}
          <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-800/60">
            {[
              { num: 1, label: 'Modo' },
              { num: 2, label: 'Ubicación' },
              { num: 3, label: 'Respaldo' },
              { num: 4, label: 'Confirmación' }
            ].map((s) => (
              <div key={s.num} className="flex items-center space-x-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                    step === s.num
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/40 ring-2 ring-blue-400/40'
                      : step > s.num
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                </div>
                <span className={`text-xs font-semibold hidden sm:inline ${step === s.num ? 'text-white' : 'text-slate-500'}`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Mensajes de Alerta */}
        {errorMsg && (
          <div className="mb-4 p-3.5 bg-red-950/80 border border-red-500/50 rounded-2xl flex items-center space-x-2.5 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3.5 bg-emerald-950/80 border border-emerald-500/50 rounded-2xl flex items-center space-x-2.5 text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Contenido Dinámico por Paso */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-5">
          
          {/* PASO 1: SELECCIÓN DE MODO DE ALMACENAMIENTO */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">
                  Selecciona la arquitectura de almacenamiento para este dispositivo
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Puedes cambiar esta preferencia en cualquier momento sin perder tus datos de almacén.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Opción 1: Local-First con Respaldo en la Nube */}
                <div
                  onClick={() => setModo('LOCAL_SYNC')}
                  className={`p-5 rounded-2xl border cursor-pointer transition relative flex flex-col justify-between ${
                    modo === 'LOCAL_SYNC'
                      ? 'bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/30'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {modo === 'LOCAL_SYNC' && (
                    <span className="absolute top-3 right-3 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-600 text-white">
                      Recomendado
                    </span>
                  )}

                  <div>
                    <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center mb-3">
                      <HardDrive className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-white">
                      Caché Local + Sincronización de Inventario
                    </h4>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      La PWA conserva en IndexedDB los datos consultados y permite registrar offline ingresos, despachos y ajustes. Los cambios administrativos requieren conexión.
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center text-[11px] text-blue-300">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                    <span>Aislamiento por empresa y equipo</span>
                  </div>
                </div>

                {/* Opción 2: Administrado en la Nube */}
                <div
                  onClick={() => setModo('CLOUD_MANAGED')}
                  className={`p-5 rounded-2xl border cursor-pointer transition relative flex flex-col justify-between ${
                    modo === 'CLOUD_MANAGED'
                      ? 'bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/30'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="w-12 h-12 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mb-3">
                      <Cloud className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-white">
                      Almacenamiento Administrado en la Nube
                    </h4>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      El servidor de LOGIXT conserva los datos centrales. La caché del navegador no está cifrada y el trabajo offline se limita a movimientos de inventario.
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center text-[11px] text-purple-300">
                    <Layers className="w-3.5 h-3.5 mr-1" />
                    <span>Gestión centralizada multi-sede</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PASO 2: UBICACIÓN Y CARPETA LOCAL */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">
                  {modo === 'LOCAL_SYNC' ? 'Configuración de Carpeta Local y Espacio' : 'Configuración de Caché y Persistencia en la Nube'}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Define dónde residirá la réplica de datos de tu inventario en esta terminal de trabajo.
                </p>
              </div>

              {modo === 'LOCAL_SYNC' ? (
                <div className="space-y-4 pt-2">
                  {/* Selector de Carpeta */}
                  <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                          <FolderOpen className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white block">
                            Carpeta de Datos de Almacén
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {nombreCarpeta || (fsPickerSupported ? 'No seleccionada aún' : 'Almacenamiento Persistente en Sandbox (IndexedDB/OPFS)')}
                          </span>
                        </div>
                      </div>

                      {fsPickerSupported ? (
                        <button
                          type="button"
                          onClick={handleSelectFolder}
                          disabled={isProcessing}
                          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 transition shadow-sm cursor-pointer disabled:opacity-50"
                        >
                          <FolderOpen className="w-4 h-4" />
                          <span>{nombreCarpeta ? 'Cambiar Carpeta' : 'Elegir Carpeta'}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
                          Navegador Seguro
                        </span>
                      )}
                    </div>

                    {!fsPickerSupported && (
                      <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 text-[11px] text-slate-300 leading-relaxed">
                        ℹ️ Tu navegador utiliza almacenamiento web persistente protegido en sandbox (IndexedDB/OPFS). Los datos permanecerán aislados exclusivamente para tu cuenta y no se borrarán al cerrar el navegador.
                      </div>
                    )}
                  </div>

                  {/* Cuota de almacenamiento del navegador */}
                  {quotaInfo && (
                    <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
                          <Cpu className="w-3.5 h-3.5 text-blue-400" />
                          <span>Cuota de Almacenamiento Disponible</span>
                        </span>
                        <span className="font-mono text-slate-400">
                          {(quotaInfo.usageBytes / (1024 * 1024)).toFixed(1)} MB usados / {(quotaInfo.quotaBytes / (1024 * 1024 * 1024)).toFixed(1)} GB asignados
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-300"
                          style={{ width: `${Math.max(3, quotaInfo.usagePercent)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-purple-950/30 border border-purple-500/30 rounded-2xl space-y-3">
                  <div className="flex items-center space-x-3 text-purple-300 text-xs">
                    <Cloud className="w-5 h-5 shrink-0" />
                    <span>
                      En modo <strong>Almacenamiento Administrado</strong>, las transacciones se envían al backend de LOGIXT cuando hay conexión. La caché local del navegador no está cifrada.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PASO 3: POLÍTICAS DE RESPALDO Y SINCRONIZACIÓN */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">
                  Preferencias de Respaldo y Sincronización
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Esta instalación no ejecuta respaldos programados. Los respaldos se generan manualmente; la sincronización de movimientos pendientes puede reanudarse al volver la conexión.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Respaldos disponibles
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { id: 'TIEMPO_REAL', label: 'Tiempo Real', desc: 'No activo' },
                    { id: 'DIARIA', label: 'Diaria', desc: 'No activa' },
                    { id: 'SEMANAL', label: 'Semanal', desc: 'No activa' },
                    { id: 'MANUAL', label: 'Manual', desc: 'Solo a petición' }
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      disabled={f.id !== 'MANUAL'}
                      onClick={() => setFrecuencia('MANUAL')}
                      className={`p-3 rounded-xl border text-left transition ${
                        frecuencia === f.id
                          ? 'bg-blue-600/30 border-blue-500 text-white'
                          : 'bg-slate-900/60 border-slate-800 text-slate-500'
                      }`}
                    >
                      <span className="text-xs font-bold block">{f.label}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">{f.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Toggles */}
                <div className="space-y-2.5 pt-3">
                  <div
                    onClick={() => setAutoSincronizar(!autoSincronizar)}
                    className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between cursor-pointer hover:bg-slate-800/60 transition"
                  >
                    <div className="flex items-center space-x-2.5">
                      <RefreshCw className={`w-4 h-4 ${autoSincronizar ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <div>
                        <span className="text-xs font-bold text-white block">Sincronización Automática</span>
                        <span className="text-[10px] text-slate-400">Reanudar y sincronizar cambios pendientes al recuperar internet</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoSincronizar}
                      onChange={() => {}}
                      className="rounded text-blue-600 focus:ring-0"
                    />
                  </div>

                  <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center space-x-2.5">
                    <div className="flex items-center space-x-2.5">
                      <Lock className="w-4 h-4 text-blue-400" />
                      <div>
                        <span className="text-xs font-bold text-white block">Verificación de integridad (SHA-256)</span>
                        <span className="text-[10px] text-slate-400">Los archivos JSON no se cifran; protégelos al guardarlos o compartirlos.</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PASO 4: CONFIRMACIÓN Y ACTIVACIÓN */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">
                  Confirmación de la Arquitectura de Almacenamiento
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Revisa los parámetros antes de activar la configuración y generar el punto de restauración inicial.
                </p>
              </div>

              <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3 text-xs">
                <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Modo de Almacenamiento:</span>
                  <span className="font-bold text-blue-400">
                    {modo === 'LOCAL_SYNC' ? 'Local-First + Sincronización en la Nube' : 'Administrado en la Nube'}
                  </span>
                </div>

                <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Ubicación / Motor Local:</span>
                  <span className="font-mono text-slate-200">
                    {nombreCarpeta || (tipoLocal === 'DIRECTORIO_LOCAL' ? 'Carpeta Local' : 'IndexedDB Privada')}
                  </span>
                </div>

                <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Frecuencia de Respaldo:</span>
                  <span className="font-bold text-slate-200">{frecuencia}</span>
                </div>

                <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Auto-sincronización:</span>
                  <span className="font-bold text-emerald-400">
                    {autoSincronizar ? 'Activada' : 'Manual'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Protección Criptográfica:</span>
                  <span className="font-bold text-slate-200">SHA-256 + SSL/TLS</span>
                </div>
              </div>

              <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-xl text-[11px] text-blue-300 flex items-center space-x-2">
                <Sparkles className="w-4 h-4 shrink-0 text-blue-400" />
                <span>
                  Al hacer clic en <strong>Activar Configuración</strong>, se creará automáticamente un respaldo inicial seguro para tu empresa.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer con Botones de Navegación del Asistente */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              disabled={isProcessing}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Atrás</span>
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-lg shadow-blue-950/50 transition cursor-pointer"
            >
              <span>Siguiente</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinishConfiguration}
              disabled={isProcessing}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs flex items-center space-x-2 shadow-xl shadow-blue-950/60 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>{isProcessing ? 'Guardando y Respaldando...' : 'Activar Configuración'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
