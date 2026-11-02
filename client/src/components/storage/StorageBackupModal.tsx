import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  HardDrive,
  Cloud,
  FolderOpen,
  RefreshCw,
  Download,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Clock,
  FileText,
  Lock,
  Layers,
  ArrowUpRight,
  Settings,
  Sparkles,
  Cpu,
  Trash2,
  Upload
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { api, ApiError, syncPendingMovementMutations } from '../../services/api';
import { sound } from '../../services/sound';
import { offlineDataRepository } from '../../repositories/offlineDataRepository';
import {
  getStorageQuota,
  isOnline,
  isNetworkUnavailable,
  exportSnapshotToLocalFolder,
  getSavedLocalFolderName,
  getLocalInventorySnapshot,
  restoreLocalInventorySnapshot
} from '../../services/localStorageDb';
import { Respaldo, SincronizacionLog, StorageConfig } from '../../types';
import { PendingMovementMutation } from '../../services/localStorageDb';

interface StorageBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSetupWizard: () => void;
}

type StorageTab = 'respaldos' | 'sincronizacion' | 'configuracion';

interface GoogleDriveBackup {
  id: string;
  name: string;
  sizeBytes: number;
  createdAt: string | null;
  checksumSha256: string;
  sourceBackupId: string | null;
}

export const StorageBackupModal: React.FC<StorageBackupModalProps> = ({
  isOpen,
  onClose,
  onOpenSetupWizard
}) => {
  const { user } = useAuth();
  const { accentClasses } = useTheme();

  const [activeTab, setActiveTab] = useState<StorageTab>('respaldos');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const [config, setConfig] = useState<StorageConfig | null>(null);
  const [companySummary, setCompanySummary] = useState<any>(null);
  const [respaldos, setRespaldos] = useState<Respaldo[]>([]);
  const [googleDriveStatus, setGoogleDriveStatus] = useState<{
    configured: boolean;
    missingConfiguration: string[];
    connected: boolean;
    connectedAt: string | null;
    uploadedBackupCount: number;
    lastUploadAt: string | null;
  } | null>(null);
  const [googleDriveBackups, setGoogleDriveBackups] = useState<GoogleDriveBackup[]>([]);
  const [googleDriveNextPageToken, setGoogleDriveNextPageToken] = useState<string | null>(null);
  const [isGoogleDriveListOpen, setIsGoogleDriveListOpen] = useState(false);
  const [isLoadingGoogleDriveBackups, setIsLoadingGoogleDriveBackups] = useState(false);
  const [logs, setLogs] = useState<SincronizacionLog[]>([]);
  const [pendingMutations, setPendingMutations] = useState<PendingMovementMutation[]>([]);
  const [quota, setQuota] = useState<{ usageBytes: number; quotaBytes: number; usagePercent: number } | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal de confirmación de restauración
  const [restoreCandidate, setRestoreCandidate] = useState<Respaldo | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadAllStorageData();
    }
  }, [isOpen]);

  const loadAllStorageData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const callbackResult = new URLSearchParams(window.location.search).get('googleDrive');
      if (callbackResult) {
        const callbackMessages: Record<string, string> = {
          connected: 'Google Drive se conectó correctamente.',
          cancelled: 'Se canceló la autorización de Google Drive.',
          invalid_state: 'La autorización expiró o no es válida. Intenta conectar de nuevo.',
          unauthorized: 'La empresa o los permisos del administrador cambiaron. Inicia de nuevo la autorización.',
          oauth_failed: 'No se pudo completar la autorización de Google Drive. Intenta conectar de nuevo.'
        };
        const callbackMessage = callbackMessages[callbackResult];
        if (callbackMessage) {
          if (callbackResult === 'connected') setSuccessMsg(callbackMessage);
          else setErrorMsg(callbackMessage);
        }
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('googleDrive');
        window.history.replaceState(window.history.state, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      }

      const [cfgRes, backupsRes, logsRes, quotaRes, pendingRes, driveRes] = await Promise.all([
        api.storage.getConfig(),
        api.storage.getBackups(),
        api.storage.getLogs(),
        getStorageQuota(),
        offlineDataRepository.getPendingMutations(user?.id),
        api.storage.getGoogleDriveStatus().catch((error) => {
          if (isNetworkUnavailable(error) || (error instanceof ApiError && error.status === 0)) return null;
          throw error;
        })
      ]);

      setConfig(cfgRes.config);
      setCompanySummary(cfgRes.resumen_empresa);
      setRespaldos(backupsRes.respaldos || []);
      setLogs(logsRes.logs || []);
      setQuota(quotaRes);
      setPendingMutations(pendingRes);
      setGoogleDriveStatus(driveRes);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar información de almacenamiento.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateManualBackup = async () => {
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const pending = await offlineDataRepository.getPendingMutations(user?.id);
      if (pending.length > 0) {
        throw new Error('Sincroniza o resuelve los movimientos pendientes antes de crear un respaldo del servidor.');
      }
      const res = await api.storage.createBackup({
        tipo: 'MANUAL',
        detalles: 'Respaldo manual solicitado desde el panel de Almacenamiento'
      });

      sound.playSuccess();
      setSuccessMsg(`¡Copia de seguridad creada exitosamente! (${(res.backup.tamano_bytes / 1024).toFixed(1)} KB)`);
      await loadAllStorageData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al generar la copia de seguridad.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerSync = async () => {
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const pushRes = await syncPendingMovementMutations(true);
      const pullRes = await api.storage.syncPull();
      const pendingAfterSync = await offlineDataRepository.getPendingMutations(user?.id);
      sound.playSuccess();
      const applied = pushRes?.appliedCount || 0;
      const conflicts = pendingAfterSync.filter((mutation) => mutation.status === 'CONFLICT').length;
      const stillPending = pendingAfterSync.filter((mutation) =>
        mutation.status === 'PENDING' || mutation.status === 'SYNCING' || mutation.status === 'ERROR'
      ).length;
      setSuccessMsg(
        `Sincronización completada: ${applied} movimientos aplicados, ${stillPending} siguen pendientes, ${conflicts} conflictos; ${pullRes.productos.length} productos y ${pullRes.movimientos.length} movimientos descargados.`
      );
      await loadAllStorageData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error durante la sincronización.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryConflict = async (mutation: PendingMovementMutation) => {
    if (!isOnline()) {
      setErrorMsg('Conéctate a internet antes de reintentar una operación en conflicto.');
      return;
    }

    const stockBase = await offlineDataRepository.getEffectiveCachedStock(mutation.data.producto_id);
    if (stockBase === null) {
      setErrorMsg('No hay una copia local actual del producto para preparar el reintento.');
      return;
    }

    const confirmed = window.confirm(
      `${mutation.last_error || 'La operación encontró un conflicto.'}\n\n¿Deseas crear un nuevo intento con el stock local actual (${stockBase})? El servidor volverá a validar permisos y existencias.`
    );
    if (!confirmed) return;

    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await offlineDataRepository.requeueConflictedMutation(mutation.sync_id, stockBase);
      const pushRes = await syncPendingMovementMutations(true);
      await api.storage.syncPull();
      setSuccessMsg(
        pushRes?.conflictsCount
          ? 'El reintento fue recibido, pero todavía requiere revisión. Consulta el detalle del conflicto.'
          : 'La operación pendiente se procesó y sincronizó correctamente.'
      );
      await loadAllStorageData();
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo reintentar la operación pendiente.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDiscardBlocked = async (mutation: PendingMovementMutation) => {
    const confirmed = window.confirm(
      `¿Descartar el movimiento ${mutation.data.tipo} del producto #${mutation.data.producto_id}? Esta acción elimina la copia local pendiente y no modifica los datos del servidor.`
    );
    if (!confirmed) return;

    setActionLoading(true);
    setErrorMsg(null);
    try {
      await offlineDataRepository.discardBlockedMutation(mutation.sync_id);
      setSuccessMsg('La operación bloqueada se descartó del almacenamiento local.');
      await loadAllStorageData();
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo descartar la operación bloqueada.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportLocalFile = async () => {
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const pending = await offlineDataRepository.getPendingMutations(user?.id);
      if (pending.length > 0) {
        throw new Error('Sincroniza o resuelve los movimientos pendientes antes de exportar una copia local.');
      }
      let refreshedFromServer = false;
      if (isOnline()) {
        try {
          await api.storage.syncPull();
          refreshedFromServer = true;
        } catch (error) {
          if (!isNetworkUnavailable(error)) throw error;
        }
      }
      const inventory = await getLocalInventorySnapshot();
      const exportRes = await exportSnapshotToLocalFolder({
        version: '2.0.0',
        system: 'LOGIXT',
        exported_at: new Date().toISOString(),
        empresa_id: user?.empresa_id,
        empresa_nombre: user?.empresa_nombre,
        data: inventory
      });

      sound.playSuccess();
      const freshnessNotice = refreshedFromServer
        ? ''
        : ' Se usaron los datos disponibles localmente, que pueden estar desactualizados.';
      if (exportRes.writtenToFolder) {
        setSuccessMsg(`Archivo guardado directamente en la carpeta local: ${exportRes.fileName}.${freshnessNotice}`);
      } else {
        const fallbackNotice = exportRes.fallbackReason
          ? `No se pudo escribir en la carpeta seleccionada: ${exportRes.fallbackReason}. `
          : '';
        setSuccessMsg(
          `Archivo descargado localmente en tu equipo: ${exportRes.fileName}.${fallbackNotice}${freshnessNotice}`
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al exportar copia local.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartLocalImport = () => {
    const confirmed = window.confirm(
      'La importación reemplazará únicamente los datos locales de la empresa activa en este dispositivo. No modifica el servidor. Debes sincronizar o resolver primero cualquier movimiento pendiente. ¿Deseas seleccionar un archivo de respaldo?'
    );
    if (confirmed) importFileRef.current?.click();
  };

  const handleImportLocalFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = await restoreLocalInventorySnapshot(parsed);
      const integrity = result.checksumVerified
        ? 'Checksum SHA-256 verificado.'
        : 'Aviso: este respaldo antiguo no incluye checksum criptográfico.';
      setSuccessMsg(
        `Copia importada solo en este dispositivo: ${result.productos} productos, ${result.categorias} categorías y ${result.movimientos} movimientos. ${integrity} Recarga la aplicación para actualizar las vistas.`
      );
      sound.playSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo importar el archivo de respaldo.');
      sound.playError();
    } finally {
      input.value = '';
      setActionLoading(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreCandidate) return;
    setIsRestoring(true);
    setErrorMsg(null);

    try {
      const pending = await offlineDataRepository.getPendingMutations(user?.id);
      if (pending.length > 0) {
        throw new Error('Sincroniza o resuelve los movimientos pendientes antes de restaurar un respaldo del servidor.');
      }
      const res = await api.storage.restoreBackup(restoreCandidate.id);
      try {
        const snapshot = await api.storage.syncPull(null);
        await restoreLocalInventorySnapshot({
          version: '2.0.0',
          system: 'LOGIXT',
          empresa_id: user?.empresa_id,
          data: snapshot
        });
        await offlineDataRepository.setLastSyncTimestamp(snapshot.timestamp);
      } catch (refreshError: any) {
        throw new Error(
          `El servidor restauró el respaldo, pero no se pudo actualizar la copia local: ${refreshError.message || 'error de sincronización'}.`
        );
      }
      sound.playSuccess();
      setSuccessMsg(`¡Restauración exitosa! Se restauraron ${res.restoredCounts.productos} productos y ${res.restoredCounts.movimientos} movimientos. Copia preventiva guardada.`);
      setRestoreCandidate(null);
      await loadAllStorageData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error durante la restauración del respaldo.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleLoadGoogleDriveBackups = async (pageToken?: string) => {
    setIsLoadingGoogleDriveBackups(true);
    setErrorMsg(null);
    try {
      const result = await api.storage.getGoogleDriveBackups(pageToken);
      setGoogleDriveBackups((current) => pageToken ? [...current, ...result.backups] : result.backups);
      setGoogleDriveNextPageToken(result.nextPageToken);
      setIsGoogleDriveListOpen(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudieron consultar los respaldos de Google Drive.');
    } finally {
      setIsLoadingGoogleDriveBackups(false);
    }
  };

  const handleRestoreGoogleDriveBackup = async (backup: GoogleDriveBackup) => {
    if (!window.confirm(
      `Vas a reemplazar el inventario del servidor con "${backup.name}" (${backup.createdAt ? new Date(backup.createdAt).toLocaleString() : 'fecha no disponible'}). Se creará primero un respaldo preventivo. ¿Deseas continuar?`
    )) return;

    setIsRestoring(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const pending = await offlineDataRepository.getPendingMutations(user?.id);
      if (pending.length > 0) {
        throw new Error('Sincroniza o resuelve los movimientos pendientes antes de restaurar un respaldo de Google Drive.');
      }

      const result = await api.storage.restoreGoogleDriveBackup(backup.id);
      try {
        const snapshot = await api.storage.syncPull(null);
        await restoreLocalInventorySnapshot({
          version: '2.0.0',
          system: 'LOGIXT',
          empresa_id: user?.empresa_id,
          data: snapshot
        });
        await offlineDataRepository.setLastSyncTimestamp(snapshot.timestamp);
      } catch (refreshError: any) {
        throw new Error(
          `El servidor restauró el respaldo, pero no se pudo actualizar la copia local: ${refreshError.message || 'error de sincronización'}.`
        );
      }

      sound.playSuccess();
      setSuccessMsg(
        `Respaldo de Google Drive restaurado: ${result.restoredCounts.productos} productos, ${result.restoredCounts.movimientos} movimientos. Copia preventiva guardada.`
      );
      await handleLoadGoogleDriveBackups();
      await loadAllStorageData();
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo restaurar el respaldo de Google Drive.');
      sound.playError();
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteBackup = async (backupId: number, nombreArchivo: string) => {
    if (!confirm(`¿Eliminar la copia de seguridad "${nombreArchivo}"?`)) return;
    try {
      await api.storage.deleteBackup(backupId);
      sound.playSuccess();
      setSuccessMsg(`Copia de seguridad "${nombreArchivo}" eliminada.`);
      await loadAllStorageData();
    } catch (err: any) {
      sound.playError();
      setErrorMsg(err.message || 'Error al eliminar copia de seguridad.');
    }
  };

  const handleDownloadBackup = async (backup: Respaldo) => {
    setActionLoading(true);
    setErrorMsg(null);
    try {
      const result = await api.storage.downloadBackup(backup.id);
      sound.playSuccess();
      setSuccessMsg(`Respaldo descargado: ${result.fileName}`);
    } catch (err: any) {
      sound.playError();
      setErrorMsg(err.message || 'Error al descargar el respaldo.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConnectGoogleDrive = async () => {
    setActionLoading(true);
    setErrorMsg(null);
    try {
      const result = await api.storage.connectGoogleDrive();
      window.location.assign(result.authorizationUrl);
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo iniciar la conexión con Google Drive.');
      setActionLoading(false);
    }
  };

  const handleDisconnectGoogleDrive = async () => {
    if (!window.confirm('¿Desconectar la cuenta de Google Drive de esta empresa?')) return;
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const result = await api.storage.disconnectGoogleDrive();
      setSuccessMsg(result.message);
      await loadAllStorageData();
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo desconectar Google Drive.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadBackupToGoogleDrive = async (backup: Respaldo) => {
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const result = await api.storage.uploadBackupToGoogleDrive(backup.id);
      sound.playSuccess();
      setSuccessMsg(result.message);
      await loadAllStorageData();
    } catch (err: any) {
      sound.playError();
      setErrorMsg(err.message || 'No se pudo subir el respaldo a Google Drive.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  const online = isOnline();
  const folderName = config?.nombre_carpeta_local || getSavedLocalFolderName() || 'Almacenamiento Seguro (IndexedDB)';
  const canManageBackups = user?.rol === 'ADMINISTRADOR' || user?.rol === 'SUPERADMIN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-5xl bg-[#080f24] border border-blue-500/40 rounded-3xl p-5 sm:p-8 shadow-2xl shadow-blue-950/70 relative overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Glow atmosférico */}
        <div className="absolute top-0 right-0 -mr-24 -mt-24 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Encabezado Principal */}
        <div className="border-b border-slate-800 pb-4 mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-950/50">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl sm:text-2xl font-black text-white">
                  Almacenamiento y Copias de Seguridad
                </h2>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950/80 text-blue-400 border border-blue-500/30">
                  {config?.modo === 'LOCAL_SYNC' ? 'Local-First' : 'Cloud-Managed'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Respaldos del servidor y exportación local para recuperación
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            {/* Estado de Conexión */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-semibold">
              <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              <span className={online ? 'text-emerald-300' : 'text-red-300'}>
                {online ? 'En línea' : 'Sin conexión'}
              </span>
            </div>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tarjetas KPI de Estado */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {/* KPI 1: Ubicación Local */}
          <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="font-semibold flex items-center space-x-1">
                <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                <span>Ubicación Local</span>
              </span>
              <button
                onClick={onOpenSetupWizard}
                className="text-blue-400 hover:text-blue-300 text-[11px] font-bold cursor-pointer"
                title="Cambiar carpeta o modo"
              >
                Cambiar
              </button>
            </div>
            <p className="text-xs font-mono font-bold text-white truncate" title={folderName}>
              {folderName}
            </p>
            <span className="text-[10px] text-slate-400 mt-1">
              {config?.tipo_almacenamiento_local === 'DIRECTORIO_LOCAL' ? '📁 Directorio en Disco' : '🔒 IndexedDB Privada'}
            </span>
          </div>

          {/* KPI 2: Estado de Sincronización */}
          <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="font-semibold flex items-center space-x-1">
                <Cloud className="w-3.5 h-3.5 text-indigo-400" />
                <span>Servidor LOGIXT</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 font-bold">
                Respaldos
              </span>
            </div>
            <p className="text-xs font-bold text-white">
              {config?.estado_sincronizacion || 'SINCRONIZADO'}
            </p>
            <span className="text-[10px] text-slate-400 mt-1">
              Programación automática: no activa
            </span>
          </div>

          {/* KPI 3: Último Respaldo */}
          <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col justify-between">
            <div className="text-slate-400 text-xs font-semibold mb-1 flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              <span>Último Respaldo</span>
            </div>
            <p className="text-xs font-bold text-white">
              {companySummary?.ultimo_respaldo_global
                ? new Date(companySummary.ultimo_respaldo_global).toLocaleString()
                : 'Pendiente de inicio'}
            </p>
            <span className="text-[10px] text-slate-400 mt-1">
              {respaldos.length} puntos de restauración
            </span>
          </div>

          {/* KPI 4: Espacio y Cuota */}
          <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col justify-between">
            <div className="flex justify-between items-center text-slate-400 text-xs mb-1">
              <span className="font-semibold flex items-center space-x-1">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>Cuota Utilizada</span>
              </span>
              <span className="font-mono text-[10px] text-slate-300">
                {quota ? `${quota.usagePercent}%` : '0%'}
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden my-1">
              <div
                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full"
                style={{ width: `${Math.max(4, quota?.usagePercent || 5)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              {companySummary ? `${(companySummary.total_bytes_respaldos / (1024 * 1024)).toFixed(2)} MB respaldados` : '0 MB'}
            </span>
          </div>
        </div>

        {/* Acciones Rápidas */}
        <div className="flex flex-wrap gap-2.5 mb-5">
          <button
            onClick={handleCreateManualBackup}
            disabled={actionLoading}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl flex items-center space-x-2 transition shadow-md shadow-blue-950/40 cursor-pointer disabled:opacity-50"
          >
            <Database className="w-4 h-4" />
            <span>Crear Respaldo Ahora</span>
          </button>

          <button
            onClick={handleTriggerSync}
            disabled={actionLoading}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center space-x-2 transition border border-slate-700 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
            <span>Sincronizar con Servidor</span>
          </button>

          <button
            onClick={handleExportLocalFile}
            disabled={actionLoading}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center space-x-2 transition border border-slate-700 cursor-pointer disabled:opacity-50"
            title="Exportar un respaldo JSON a una carpeta autorizada o descargarlo"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Exportar Copia Local</span>
          </button>

          {canManageBackups && (
            <button
              onClick={handleStartLocalImport}
              disabled={actionLoading}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center space-x-2 transition border border-slate-700 cursor-pointer disabled:opacity-50"
              title="Reemplazar la copia local de esta empresa desde un archivo LOGIXT"
            >
              <Upload className="w-4 h-4 text-amber-400" />
              <span>Importar Copia Local</span>
            </button>
          )}
          <input
            ref={importFileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportLocalFile}
          />

          <button
            onClick={onOpenSetupWizard}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold text-xs rounded-xl flex items-center space-x-2 transition border border-slate-800 ml-auto cursor-pointer"
          >
            <Settings className="w-4 h-4 text-blue-400" />
            <span>Asistente de Configuración</span>
          </button>
        </div>

        <section className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Cloud className={`mt-0.5 h-4 w-4 shrink-0 ${googleDriveStatus?.connected ? 'text-emerald-400' : 'text-blue-400'}`} />
            <div>
              <p className="text-xs font-bold text-white">Google Drive</p>
              <p className="mt-1 text-[10px] text-slate-400">
                {!googleDriveStatus
                  ? 'Consultando el estado de conexión...'
                  : googleDriveStatus.connected
                  ? `Conectado · ${googleDriveStatus.uploadedBackupCount} respaldos subidos${googleDriveStatus.lastUploadAt ? ` · último: ${new Date(googleDriveStatus.lastUploadAt).toLocaleString()}` : ''}${googleDriveStatus.configured ? '' : ' · configuración del servidor incompleta'}`
                  : !googleDriveStatus.configured
                  ? 'La integración no está configurada en el servidor.'
                  : 'Conecta la cuenta de Drive de la empresa para subir respaldos manualmente.'}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                Las subidas son manuales e independientes de la sincronización operativa.
              </p>
            </div>
          </div>
          {canManageBackups && googleDriveStatus && (
            googleDriveStatus.connected ? (
              <button
                type="button"
                onClick={() => void handleDisconnectGoogleDrive()}
                disabled={actionLoading}
                className="self-start rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[10px] font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50 sm:self-auto"
              >
                Desconectar cuenta
              </button>
            ) : googleDriveStatus.configured ? (
              <button
                type="button"
                onClick={() => void handleConnectGoogleDrive()}
                disabled={actionLoading}
                className="self-start rounded-lg border border-blue-500/40 bg-blue-950/60 px-3 py-2 text-[10px] font-bold text-blue-200 transition hover:bg-blue-900/80 disabled:opacity-50 sm:self-auto"
              >
                <Cloud className="mr-1 inline h-3.5 w-3.5" />
                Conectar Google Drive
              </button>
            ) : null
          )}
        </section>

        {canManageBackups && googleDriveStatus?.connected && (
          <section className="mb-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-white">Copias guardadas en Google Drive</p>
              <button
                type="button"
                onClick={() => {
                  if (isGoogleDriveListOpen) {
                    setIsGoogleDriveListOpen(false);
                  } else {
                    void handleLoadGoogleDriveBackups();
                  }
                }}
                disabled={isLoadingGoogleDriveBackups || isRestoring}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
              >
                {isLoadingGoogleDriveBackups ? 'Cargando...' : isGoogleDriveListOpen ? 'Ocultar copias' : 'Ver copias / restaurar'}
              </button>
            </div>
            {isGoogleDriveListOpen && (
              <div className="mt-3 space-y-2">
                {googleDriveBackups.length === 0 && !isLoadingGoogleDriveBackups ? (
                  <p className="py-3 text-center text-[10px] text-slate-400">No hay copias LOGIXT disponibles en esta cuenta.</p>
                ) : googleDriveBackups.map((backup) => (
                  <div key={backup.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-slate-200" title={backup.name}>{backup.name}</p>
                      <p className="mt-1 text-[9px] text-slate-500">
                        {backup.createdAt ? new Date(backup.createdAt).toLocaleString() : 'Fecha no disponible'}
                        {' · '}{(backup.sizeBytes / 1024).toFixed(1)} KB
                        {' · SHA-256 '}{backup.checksumSha256.substring(0, 12)}…
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRestoreGoogleDriveBackup(backup)}
                      disabled={isRestoring || actionLoading}
                      className="inline-flex items-center rounded-lg border border-amber-500/40 bg-amber-950/60 px-2.5 py-1.5 text-[10px] font-bold text-amber-300 transition hover:bg-amber-900/80 disabled:opacity-50"
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      Restaurar
                    </button>
                  </div>
                ))}
                {googleDriveNextPageToken && (
                  <button
                    type="button"
                    onClick={() => void handleLoadGoogleDriveBackups(googleDriveNextPageToken)}
                    disabled={isLoadingGoogleDriveBackups || isRestoring}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[10px] font-bold text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
                  >
                    {isLoadingGoogleDriveBackups ? 'Cargando...' : 'Cargar más copias'}
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        <p className="mb-4 text-[10px] text-slate-400">
          La exportación JSON no está cifrada e incluye solo datos ya sincronizados; no contiene movimientos pendientes. Los respaldos automáticos programados siguen inactivos.
        </p>

        {/* Alertas */}
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

        {/* Pestañas de Navegación del Modal */}
        <div className="flex border-b border-slate-800 space-x-6 text-xs font-bold mb-4">
          <button
            onClick={() => setActiveTab('respaldos')}
            className={`pb-3 transition border-b-2 cursor-pointer ${
              activeTab === 'respaldos'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Historial de Respaldos ({respaldos.length})
          </button>

          <button
            onClick={() => setActiveTab('sincronizacion')}
            className={`pb-3 transition border-b-2 cursor-pointer ${
              activeTab === 'sincronizacion'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Auditoría de Sincronización ({logs.length})
          </button>
        </div>

        {/* Contenido de Pestañas */}
        <div className="flex-1 overflow-y-auto pr-1">
          {/* TAB 1: HISTORIAL DE RESPALDOS */}
          {activeTab === 'respaldos' && (
            <div className="space-y-3">
              {loading ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Cargando copias de seguridad...
                </div>
              ) : respaldos.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <Database className="w-12 h-12 text-slate-600 mx-auto" />
                  <p className="text-sm font-bold text-white">No hay respaldos generados aún</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Haz clic en "Crear Respaldo Ahora" para generar la primera copia de seguridad de tu inventario.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="pb-3 pl-2">Fecha y Hora</th>
                        <th className="pb-3">Tipo</th>
                        <th className="pb-3">Archivo / Checksum</th>
                        <th className="pb-3">Registros</th>
                        <th className="pb-3">Tamaño</th>
                        <th className="pb-3">Estado</th>
                        <th className="pb-3 text-right pr-2">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {respaldos.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-900/50 transition">
                          <td className="py-3 pl-2 font-mono text-slate-200">
                            {new Date(r.fecha_creacion).toLocaleString()}
                          </td>
                          <td className="py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                r.tipo === 'PREVENTIVO'
                                  ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                                  : r.tipo === 'AUTOMATICO'
                                  ? 'bg-purple-950/80 text-purple-300 border border-purple-500/40'
                                  : 'bg-blue-950/80 text-blue-300 border border-blue-500/40'
                              }`}
                            >
                              {r.tipo}
                            </span>
                          </td>
                          <td className="py-3 font-mono text-[11px] text-slate-300">
                            <div className="truncate max-w-[200px]" title={r.nombre_archivo}>
                              {r.nombre_archivo}
                            </div>
                            <span className="text-[9px] text-slate-500 block truncate" title={`SHA-256: ${r.checksum_sha256}`}>
                              SHA: {r.checksum_sha256.substring(0, 16)}...
                            </span>
                          </td>
                          <td className="py-3 text-slate-300">
                            <span className="font-semibold">{r.total_productos}</span> prod. / <span className="font-semibold">{r.total_movimientos}</span> mov.
                          </td>
                          <td className="py-3 font-mono text-slate-300">
                            {(r.tamano_bytes / 1024).toFixed(1)} KB
                          </td>
                          <td className="py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                r.estado === 'RESTAURADO'
                                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {r.estado}
                            </span>
                          </td>
                          <td className="py-3 text-right pr-2 space-x-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => void handleDownloadBackup(r)}
                              className="inline-flex items-center px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-bold transition disabled:opacity-50"
                              title="Descargar snapshot JSON"
                            >
                              <Download className="w-3.5 h-3.5 mr-1 text-blue-400" />
                              <span>Descargar</span>
                            </button>

                            {canManageBackups && (
                              <>
                                {googleDriveStatus?.configured && googleDriveStatus.connected && (
                                  <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() => void handleUploadBackupToGoogleDrive(r)}
                                    className="inline-flex items-center px-2.5 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-300 rounded-lg text-[11px] font-bold transition disabled:opacity-50"
                                    title="Subir este respaldo verificado a Google Drive"
                                  >
                                    <Cloud className="w-3.5 h-3.5 mr-1" />
                                    <span>Drive</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setRestoreCandidate(r)}
                                  className="inline-flex items-center px-2.5 py-1.5 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/40 text-amber-300 rounded-lg text-[11px] font-bold transition cursor-pointer"
                                  title="Restaurar base de datos a este punto"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                  <span>Restaurar</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteBackup(r.id, r.nombre_archivo)}
                                  className="inline-flex items-center p-1.5 bg-slate-800 hover:bg-rose-950/80 border border-slate-700 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 rounded-lg transition cursor-pointer"
                                  title="Eliminar esta copia de seguridad"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: AUDITORÍA DE SINCRONIZACIÓN */}
          {activeTab === 'sincronizacion' && (
            <div className="space-y-3">
              {pendingMutations.length > 0 && (
                <section className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
                  <h3 className="mb-2 text-xs font-bold text-amber-200">
                    Operaciones locales pendientes ({pendingMutations.length})
                  </h3>
                  <div className="space-y-2">
                    {pendingMutations.map((mutation) => (
                      <div key={mutation.sync_id} className="rounded-lg bg-slate-950/50 px-3 py-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-200">
                            {mutation.data.tipo} · Producto #{mutation.data.producto_id}
                          </span>
                          <span className={
                            mutation.status === 'CONFLICT'
                              ? 'font-bold text-rose-300'
                              : mutation.status === 'ERROR'
                              ? 'font-bold text-amber-300'
                              : 'font-bold text-sky-300'
                          }>
                            {mutation.status}
                          </span>
                          {mutation.status === 'CONFLICT' && (
                            <button
                              type="button"
                              disabled={actionLoading || !isOnline()}
                              onClick={() => void handleRetryConflict(mutation)}
                              className="rounded-lg border border-amber-500/40 px-2 py-1 font-bold text-amber-200 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Reintentar con stock actual
                            </button>
                          )}
                          {(mutation.status === 'CONFLICT' || mutation.status === 'ERROR') && (
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => void handleDiscardBlocked(mutation)}
                              className="rounded-lg border border-rose-500/30 px-2 py-1 font-bold text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Descartar
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-slate-400">
                          {mutation.last_error || `Guardado ${new Date(mutation.created_at).toLocaleString()}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {logs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  {pendingMutations.length === 0 ? 'No hay registros de sincronización aún.' : 'Las operaciones pendientes se conservan hasta sincronizarse.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="pb-3 pl-2">Fecha y Hora</th>
                        <th className="pb-3">Operación</th>
                        <th className="pb-3">Entidad</th>
                        <th className="pb-3">Registros</th>
                        <th className="pb-3">Estado</th>
                        <th className="pb-3">Detalles</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {logs.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-900/50 transition">
                          <td className="py-3 pl-2 font-mono text-slate-300">
                            {new Date(l.fecha_hora).toLocaleString()}
                          </td>
                          <td className="py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                l.tipo_operacion === 'RESTORE'
                                  ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                                  : l.tipo_operacion === 'SUBIDA'
                                  ? 'bg-blue-950/80 text-blue-300 border border-blue-500/40'
                                  : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                              }`}
                            >
                              {l.tipo_operacion}
                            </span>
                          </td>
                          <td className="py-3 font-semibold text-slate-200">{l.entidad}</td>
                          <td className="py-3 font-mono text-slate-300">{l.registros_afectados}</td>
                          <td className="py-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                              l.estado === 'FALLIDO'
                                ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                                : l.estado === 'EN_PROGRESO'
                                ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                                : 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                            }`}>
                              {l.estado}
                            </span>
                          </td>
                          <td className="py-3 text-slate-400 max-w-xs truncate" title={l.detalles || ''}>
                            {l.detalles || 'Operación completada'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal de Confirmación de Restauración */}
        {restoreCandidate && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-md bg-[#0a122c] border border-amber-500/50 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-950/80 border border-amber-500/50 flex items-center justify-center text-amber-400 mx-auto">
                <RotateCcw className="w-6 h-6" />
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-lg font-black text-white">¿Restaurar Copia de Seguridad?</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Vas a restaurar los datos al punto de restauración del{' '}
                  <strong className="text-amber-400">
                    {new Date(restoreCandidate.fecha_creacion).toLocaleString()}
                  </strong>.
                </p>
              </div>

              <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl text-[11px] text-amber-200 space-y-1.5 leading-relaxed">
                <p className="font-bold flex items-center space-x-1">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Protección preventiva garantizada</span>
                </p>
                <p>
                  Antes de modificar cualquier dato, Logixt creará automáticamente una <strong>copia preventiva</strong> de tu inventario actual para que nunca pierdas información.
                </p>
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRestoreCandidate(null)}
                  disabled={isRestoring}
                  className="w-1/2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleConfirmRestore}
                  disabled={isRestoring}
                  className="w-1/2 py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-2 transition shadow-lg shadow-amber-950/50 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                  <span>{isRestoring ? 'Restaurando...' : 'Confirmar Restauración'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
