import React, { useState, useEffect } from 'react';
import {
  Building2,
  Shield,
  CreditCard,
  Layers,
  Users,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Search,
  Filter,
  RefreshCw,
  LogOut,
  ArrowRight,
  TrendingUp,
  Settings,
  Edit2,
  Lock,
  Unlock,
  Eye,
  Check,
  X,
  FileText,
  Laptop,
  Tablet,
  Monitor,
  Key,
  Activity,
  BarChart3,
  DollarSign,
  Smartphone,
  Trash2,
  ExternalLink,
  ChevronRight,
  Database,
  HardDrive,
  Download,
  RotateCcw,
  ShieldCheck
} from 'lucide-react';
import { api } from '../services/api';
import { sound } from '../services/sound';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  Empresa,
  Plan,
  SaaSMetrics,
  AnalyticsCharts,
  WebhookLog,
  Pago,
  User,
  Dispositivo,
  ActividadLog,
  Suscripcion,
  StorageAdminStatus,
  Respaldo
} from '../types';

type AdminTab =
  | 'dashboard'
  | 'empresas'
  | 'dispositivos'
  | 'suscripciones'
  | 'planes'
  | 'pagos'
  | 'usuarios'
  | 'reportes'
  | 'actividad'
  | 'respaldos'
  | 'config';

interface AdminPlatformPageProps {
  onGoToWarehouseDemo: () => void;
}

export const AdminPlatformPage: React.FC<AdminPlatformPageProps> = ({ onGoToWarehouseDemo }) => {
  const { user, logout } = useAuth();
  const { accentClasses } = useTheme();

  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [loading, setLoading] = useState(true);

  // Datos globales
  const [metrics, setMetrics] = useState<SaaSMetrics | null>(null);
  const [charts, setCharts] = useState<AnalyticsCharts | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [deviceStats, setDeviceStats] = useState<any>(null);
  const [suscripciones, setSuscripciones] = useState<Suscripcion[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [actividadLogs, setActividadLogs] = useState<ActividadLog[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [adminStorageStatus, setAdminStorageStatus] = useState<StorageAdminStatus | null>(null);
  const [allBackups, setAllBackups] = useState<Respaldo[]>([]);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterDeviceType, setFilterDeviceType] = useState('');
  const [filterDeviceEmpresa, setFilterDeviceEmpresa] = useState('');
  const [filterActivityAccion, setFilterActivityAccion] = useState('');

  // Modales
  const [isCreateEmpresaOpen, setIsCreateEmpresaOpen] = useState(false);
  const [newEmpresa, setNewEmpresa] = useState({
    nombre: '',
    email: '',
    telefono: '',
    plan_id: 2,
    admin_nombre: '',
    admin_usuario: '',
    admin_contrasena: '',
    admin_email: ''
  });

  const [isCreateDeviceOpen, setIsCreateDeviceOpen] = useState(false);
  const [newDevice, setNewDevice] = useState({
    empresa_id: 1,
    nombre: '',
    tipo: 'PC',
    sistema_operativo: 'Windows 11 Pro'
  });
  const [createdCodeResult, setCreatedCodeResult] = useState<{ code: string; expira: string; deviceName: string } | null>(null);

  // Modal Detalle Empresa con 6 pestañas
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
  const [empresaDetailTab, setEmpresaDetailTab] = useState<'resumen' | 'usuarios' | 'dispositivos' | 'suscripcion' | 'pagos' | 'actividad'>('resumen');
  const [empresaUsers, setEmpresaUsers] = useState<User[]>([]);
  const [empresaDevices, setEmpresaDevices] = useState<Dispositivo[]>([]);
  const [empresaPayments, setEmpresaPayments] = useState<Pago[]>([]);
  const [empresaActivity, setEmpresaActivity] = useState<ActividadLog[]>([]);
  const [loadingEmpresaDetail, setLoadingEmpresaDetail] = useState(false);

  // Modales secundarios de empresa
  const [detailModalMode, setDetailModalMode] = useState<'plan' | 'extend' | null>(null);
  const [targetPlanId, setTargetPlanId] = useState<number>(2);
  const [extendDays, setExtendDays] = useState('30');
  const [extendCustomDate, setExtendCustomDate] = useState('');

  // Editor de Plan
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState({
    precio: 0,
    max_usuarios: 5,
    max_almacenes: 1,
    max_dispositivos: 1
  });

  // Configuración
  const [diasGraciaInput, setDiasGraciaInput] = useState('5');
  const [savingConfig, setSavingConfig] = useState(false);


  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [metRes, empRes, planRes, devRes, subRes, payRes, usrRes, actRes, confRes, logRes, stRes, bksRes] = await Promise.all([
        api.admin.getMetrics(),
        api.admin.getAllEmpresas({
          search: searchQuery || undefined,
          estado: filterEstado || undefined,
          plan_id: filterPlan || undefined
        }),
        api.admin.getAllPlanes(),
        api.admin.devices.getAll({
          search: searchQuery || undefined,
          tipo: filterDeviceType || undefined,
          empresa_id: filterDeviceEmpresa || undefined
        }),
        api.admin.getAllSubscriptions(),
        api.admin.getAllPayments(),
        api.admin.getAllUsers(),
        api.admin.getActivityLogs({ accion: filterActivityAccion || undefined }),
        api.admin.getConfig(),
        api.admin.getWebhookLogs(),
        api.storage.getAdminStatus().catch(() => null),
        api.storage.getBackups().catch(() => ({ respaldos: [] }))
      ]);

      setMetrics(metRes.metrics);
      setCharts(metRes.charts);
      setEmpresas(empRes.empresas);
      setPlanes(planRes.planes);
      setDispositivos(devRes.dispositivos);
      setDeviceStats(devRes.stats);
      setSuscripciones(subRes.suscripciones);
      setPagos(payRes.payments);
      setUsuarios(usrRes.usuarios);
      setActividadLogs(actRes.logs);
      setWebhookLogs(logRes.logs);
      if (stRes) setAdminStorageStatus(stRes);
      if (bksRes?.respaldos) setAllBackups(bksRes.respaldos);

      if (confRes.config?.dias_periodo_gracia) {
        setDiasGraciaInput(confRes.config.dias_periodo_gracia);
      }
    } catch (err: any) {
      console.error('Error cargando datos de plataforma SuperAdmin:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEmpresaDetail = async (empresa: Empresa, tab: 'resumen' | 'usuarios' | 'dispositivos' | 'suscripcion' | 'pagos' | 'actividad' = 'resumen') => {
    setSelectedEmpresa(empresa);
    setEmpresaDetailTab(tab);
    setLoadingEmpresaDetail(true);

    try {
      const [uRes, dRes, pRes, aRes] = await Promise.all([
        api.admin.getEmpresaUsers(empresa.id),
        api.admin.getEmpresaDevices(empresa.id),
        api.admin.getEmpresaPayments(empresa.id),
        api.admin.getEmpresaActivity(empresa.id)
      ]);
      setEmpresaUsers(uRes.users);
      setEmpresaDevices(dRes.dispositivos);
      setEmpresaPayments(pRes.payments);
      setEmpresaActivity(aRes.activity);
    } catch (e) {
      console.error('Error cargando detalles de empresa:', e);
    } finally {
      setLoadingEmpresaDetail(false);
    }
  };

  const handleCreateEmpresa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.admin.createEmpresa({
        ...newEmpresa,
        admin_email: newEmpresa.admin_email.trim() || undefined
      });
      sound.playSuccess();
      if (res.firebase) {
        alert(res.message);
      }
      setIsCreateEmpresaOpen(false);
      setNewEmpresa({
        nombre: '',
        email: '',
        telefono: '',
        plan_id: 2,
        admin_nombre: '',
        admin_usuario: '',
        admin_contrasena: '',
        admin_email: ''
      });
      await loadAll();
    } catch (err: any) {
      sound.playError();
      alert(err.message || 'Error al crear la empresa.');
    }
  };

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.admin.devices.create(newDevice);
      sound.playSuccess();
      setCreatedCodeResult({
        code: res.codigo_activacion,
        expira: res.expira,
        deviceName: res.dispositivo.nombre
      });
      setIsCreateDeviceOpen(false);
      await loadAll();
      if (selectedEmpresa) {
        handleOpenEmpresaDetail(selectedEmpresa, 'dispositivos');
      }
    } catch (err: any) {
      sound.playError();
      alert(err.message || 'Error al crear el dispositivo.');
    }
  };

  const handleGenerateDeviceCode = async (deviceId: number) => {
    try {
      const res = await api.admin.devices.generateCode(deviceId);
      sound.playSuccess();
      alert(`Nuevo código temporal generado: ${res.codigo_activacion}\nExpira en 48 horas.`);
      await loadAll();
      if (selectedEmpresa) handleOpenEmpresaDetail(selectedEmpresa, 'dispositivos');
    } catch (e: any) {
      sound.playError();
      alert(e.message || 'Error al generar código.');
    }
  };

  const handleToggleDeviceStatus = async (deviceId: number, estado: string) => {
    try {
      await api.admin.devices.toggleStatus(deviceId, estado);
      sound.playSuccess();
      await loadAll();
      if (selectedEmpresa) handleOpenEmpresaDetail(selectedEmpresa, 'dispositivos');
    } catch (e: any) {
      sound.playError();
      alert(e.message || 'Error al cambiar estado.');
    }
  };

  const handleDeleteDevice = async (deviceId: number) => {
    if (!confirm('¿Estás seguro de revocar permanentemente este dispositivo?')) return;
    try {
      await api.admin.devices.delete(deviceId);
      sound.playSuccess();
      await loadAll();
      if (selectedEmpresa) handleOpenEmpresaDetail(selectedEmpresa, 'dispositivos');
    } catch (e: any) {
      sound.playError();
      alert(e.message || 'Error al eliminar dispositivo.');
    }
  };

  const handleDeleteEmpresa = async (empresaId: number, empresaNombre: string) => {
    if (!confirm(`⚠️ ATENCIÓN: ¿Estás seguro de ELIMINAR permanentemente la empresa "${empresaNombre}"?\n\nEsta acción borrará irrevocablemente todos sus usuarios, productos, existencias, movimientos, dispositivos, respaldos y suscripciones.`)) {
      return;
    }
    try {
      await api.admin.deleteEmpresa(empresaId);
      sound.playSuccess();
      if (selectedEmpresa?.id === empresaId) {
        setSelectedEmpresa(null);
      }
      await loadAll();
      alert(`Empresa "${empresaNombre}" eliminada exitosamente.`);
    } catch (e: any) {
      sound.playError();
      alert(e.message || 'Error al eliminar empresa.');
    }
  };

  const handleDeleteUser = async (userId: number, userName: string) => {
    if (!confirm(`¿Estás seguro de eliminar permanentemente al usuario "${userName}"?`)) return;
    try {
      await api.admin.deleteUser(userId);
      sound.playSuccess();
      await loadAll();
      if (selectedEmpresa) handleOpenEmpresaDetail(selectedEmpresa, 'usuarios');
      alert(`Usuario "${userName}" eliminado exitosamente.`);
    } catch (e: any) {
      sound.playError();
      alert(e.message || 'Error al eliminar usuario.');
    }
  };

  const handleDeleteBackup = async (backupId: number, fileName: string) => {
    if (!confirm(`¿Eliminar permanentemente la copia de seguridad "${fileName}"?`)) return;
    try {
      await api.storage.deleteBackup(backupId);
      sound.playSuccess();
      await loadAll();
    } catch (e: any) {
      sound.playError();
      alert(e.message || 'Error al eliminar copia de seguridad.');
    }
  };

  const handleDownloadBackup = async (backupId: number) => {
    try {
      await api.storage.downloadBackup(backupId);
      sound.playSuccess();
    } catch (e: any) {
      sound.playError();
      alert(e.message || 'Error al descargar copia de seguridad.');
    }
  };

  const handleToggleEmpresaStatus = async (id: number) => {
    try {
      await api.admin.toggleEmpresaStatus(id);
      sound.playSuccess();
      await loadAll();
    } catch (err: any) {
      sound.playError();
      alert(err.message || 'Error al cambiar estado.');
    }
  };

  const handleChangePlanSubmit = async () => {
    if (!selectedEmpresa) return;
    try {
      await api.admin.changePlan(selectedEmpresa.id, targetPlanId);
      sound.playSuccess();
      setDetailModalMode(null);
      await loadAll();
    } catch (err: any) {
      sound.playError();
      alert(err.message || 'Error al cambiar el plan.');
    }
  };

  const handleExtendSubscriptionSubmit = async () => {
    if (!selectedEmpresa) return;
    try {
      await api.admin.extendSubscription(selectedEmpresa.id, {
        dias_adicionales: extendDays ? parseInt(extendDays, 10) : undefined,
        nueva_fecha: extendCustomDate || undefined
      });
      sound.playSuccess();
      setDetailModalMode(null);
      await loadAll();
    } catch (err: any) {
      sound.playError();
      alert(err.message || 'Error al extender suscripción.');
    }
  };

  const handleSavePlanConfig = async () => {
    if (!editingPlan) return;
    try {
      await api.admin.updatePlan(editingPlan.id, planForm);
      sound.playSuccess();
      setEditingPlan(null);
      await loadAll();
    } catch (e: any) {
      sound.playError();
      alert(e.message || 'Error al actualizar plan.');
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await api.admin.updateConfig({ dias_periodo_gracia: parseInt(diasGraciaInput, 10) });
      sound.playSuccess();
      alert('Configuración guardada exitosamente.');
      await loadAll();
    } catch (err: any) {
      sound.playError();
      alert(err.message || 'Error al guardar configuración.');
    } finally {
      setSavingConfig(false);
    }
  };

  const menuItems: { id: AdminTab; label: string; icon: any; count?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'empresas', label: 'Empresas', icon: Building2, count: metrics?.total_empresas },
    { id: 'dispositivos', label: 'Dispositivos', icon: Laptop, count: deviceStats?.total },
    { id: 'suscripciones', label: 'Suscripciones', icon: CreditCard, count: suscripciones.length },
    { id: 'planes', label: 'Planes', icon: Layers, count: planes.length },
    { id: 'pagos', label: 'Pagos', icon: DollarSign, count: pagos.length },
    { id: 'usuarios', label: 'Usuarios', icon: Users, count: usuarios.length },
    { id: 'reportes', label: 'Reportes', icon: FileText },
    { id: 'actividad', label: 'Actividad', icon: Activity, count: actividadLogs.length },
    { id: 'respaldos', label: 'Respaldos & Storage', icon: Database, count: allBackups.length },
    { id: 'config', label: 'Configuración', icon: Settings },
  ];

  return (
    <div className="flex-1 flex flex-col bg-[#060b17] text-slate-100 font-sans min-h-screen">
      {/* Barra Superior del SuperAdmin */}
      <div className="h-16 bg-[#070e22]/90 border-b border-slate-800 px-6 flex items-center justify-between sticky top-20 z-30 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black text-white flex items-center space-x-2">
              <span>CENTRO DE CONTROL SUPERADMIN</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-purple-950/80 text-purple-400 border border-purple-500/40">
                Plataforma Global
              </span>
            </h1>
            <p className="text-[10px] text-slate-400">Gestión de Tenants, Licencias, Dispositivos y Finanzas</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadAll}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl transition cursor-pointer"
            title="Recargar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onGoToWarehouseDemo}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <span>Ver Almacén Demo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Menú de Navegación Horizontal con los 10 Módulos */}
      <div className="bg-[#070d1e] border-b border-slate-800 px-6 flex space-x-1 overflow-x-auto no-scrollbar shrink-0">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`py-3.5 px-4 font-bold text-xs flex items-center space-x-2 border-b-2 whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? `${accentClasses.border} ${accentClasses.text} bg-slate-900/40`
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
              {item.count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? 'bg-purple-950 text-purple-300' : 'bg-slate-800 text-slate-400'
                }`}>
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Contenido Principal */}
      <div className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">

        {/* ============================================================== */}
        {/* 1. DASHBOARD SUPERADMIN (6 TARJETAS + 4 GRÁFICOS REALES)       */}
        {/* ============================================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fade-in">
            {/* 6 Tarjetas de KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
              {/* Empresas Totales */}
              <div className="p-4 rounded-2xl bg-[#0b1226] border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Empresas Totales</span>
                <p className="text-2xl font-black text-white mt-1">{metrics?.total_empresas || 0}</p>
                <span className="text-[10px] text-blue-400 font-semibold mt-1 block">Tenants registrados</span>
              </div>

              {/* Suscripciones Activas */}
              <div className="p-4 rounded-2xl bg-[#0b1226] border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Suscripciones Activas</span>
                <p className="text-2xl font-black text-emerald-400 mt-1">{metrics?.suscripciones_activas || metrics?.empresas_activas || 0}</p>
                <span className="text-[10px] text-emerald-500 font-semibold mt-1 block">🟢 En servicio</span>
              </div>

              {/* Pagos Pendientes / Gracia */}
              <div className="p-4 rounded-2xl bg-[#0b1226] border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pagos Pendientes</span>
                <p className="text-2xl font-black text-amber-400 mt-1">{metrics?.empresas_past_due || metrics?.pagos_pendientes || 0}</p>
                <span className="text-[10px] text-amber-500 font-semibold mt-1 block">En gracia (5 días)</span>
              </div>

              {/* Empresas Suspendidas */}
              <div className="p-4 rounded-2xl bg-[#0b1226] border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Empresas Suspendidas</span>
                <p className="text-2xl font-black text-rose-400 mt-1">{metrics?.empresas_suspendidas || 0}</p>
                <span className="text-[10px] text-rose-500 font-semibold mt-1 block">Acceso bloqueado</span>
              </div>

              {/* Dispositivos Activos */}
              <div className="p-4 rounded-2xl bg-[#0b1226] border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Dispositivos Activos</span>
                <p className="text-2xl font-black text-purple-400 mt-1">{metrics?.dispositivos_activos || 0}</p>
                <span className="text-[10px] text-purple-400 font-semibold mt-1 block">De {metrics?.total_dispositivos || 0} totales</span>
              </div>

              {/* Usuarios de la Plataforma */}
              <div className="p-4 rounded-2xl bg-[#0b1226] border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Usuarios Totales</span>
                <p className="text-2xl font-black text-cyan-400 mt-1">{metrics?.total_usuarios || 0}</p>
                <span className="text-[10px] text-slate-400 font-semibold mt-1 block">MRR: ${metrics?.mrr || 0} USD</span>
              </div>
            </div>

            {/* 4 Gráficos Reales con SVG Reactivo */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Gráfico 1: Ingresos Mensuales (Evolución de Ingresos) */}
              <div className="p-5 rounded-3xl bg-[#0b1226] border border-slate-800 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center space-x-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <span>Evolución de Ingresos Mensuales</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">Total recaudado por pagos confirmados</p>
                  </div>
                  <span className="text-xs font-black text-emerald-400 font-mono">
                    MRR Actual: ${metrics?.mrr || 0} USD
                  </span>
                </div>

                {/* SVG Area Chart */}
                <div className="h-52 w-full flex flex-col justify-end pt-4">
                  {charts?.ingresos_mensuales && charts.ingresos_mensuales.length > 0 ? (
                    <div className="w-full h-full flex flex-col justify-between">
                      <div className="flex-1 flex items-end justify-between space-x-3 px-2">
                        {charts.ingresos_mensuales.map((item, idx) => {
                          const max = Math.max(...charts.ingresos_mensuales.map(m => m.total), 150);
                          const heightPct = Math.max(12, Math.round((item.total / max) * 100));
                          return (
                            <div key={idx} className="flex-1 flex flex-col items-center group relative">
                              {/* Tooltip */}
                              <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition duration-150 bg-slate-900 border border-slate-700 text-white text-[10px] font-bold py-1 px-2 rounded-lg pointer-events-none whitespace-nowrap shadow-xl z-20">
                                ${item.total}.00 USD
                              </div>
                              <div
                                style={{ height: `${heightPct}%` }}
                                className="w-full max-w-[48px] rounded-t-xl bg-gradient-to-t from-emerald-950 via-emerald-600 to-teal-400 border-t-2 border-emerald-300 transition-all duration-300 group-hover:scale-105 shadow-lg shadow-emerald-500/20"
                              />
                              <span className="text-[10px] font-bold text-slate-400 mt-2">{item.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-500">
                      Sin datos de facturación registrados.
                    </div>
                  )}
                </div>
              </div>

              {/* Gráfico 2: Estado de Suscripciones (Donut Circular) */}
              <div className="p-5 rounded-3xl bg-[#0b1226] border border-slate-800 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center space-x-2">
                      <CreditCard className="w-4 h-4 text-purple-400" />
                      <span>Distribución de Suscripciones</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">Estado de cuentas de clientes</p>
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    Total: {suscripciones.length}
                  </span>
                </div>

                <div className="flex items-center justify-around h-52">
                  {/* SVG Donut */}
                  <div className="relative w-36 h-36 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#253745" strokeWidth="4" />
                      {/* Activas */}
                      <circle
                        cx="18" cy="18" r="14" fill="none"
                        stroke="#4A5C6A" strokeWidth="4"
                        strokeDasharray={`${Math.max(10, Math.round(((metrics?.empresas_activas || 1) / Math.max(1, metrics?.total_empresas || 1)) * 88))} 100`}
                        strokeDashoffset="0"
                      />
                      {/* En Gracia / Past Due */}
                      {(metrics?.empresas_past_due || 0) > 0 && (
                        <circle
                          cx="18" cy="18" r="14" fill="none"
                          stroke="#9BA8AB" strokeWidth="4"
                          strokeDasharray="20 100"
                          strokeDashoffset="-60"
                        />
                      )}
                      {/* Suspendidas */}
                      {(metrics?.empresas_suspendidas || 0) > 0 && (
                        <circle
                          cx="18" cy="18" r="14" fill="none"
                          stroke="#CCD0CF" strokeWidth="4"
                          strokeDasharray="15 100"
                          strokeDashoffset="-80"
                        />
                      )}
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-xl font-black text-white">{metrics?.total_empresas || 0}</span>
                      <span className="text-[9px] uppercase font-bold text-slate-400">Tenants</span>
                    </div>
                  </div>

                  {/* Leyenda */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                      <span className="font-semibold text-slate-300">Activas ({metrics?.empresas_activas || 0})</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
                      <span className="font-semibold text-slate-300">En Gracia / Past Due ({metrics?.empresas_past_due || 0})</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
                      <span className="font-semibold text-slate-300">Suspendidas ({metrics?.empresas_suspendidas || 0})</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Gráfico 3: Dispositivos por Tipo (Tablets, PCs, Laptops) */}
              <div className="p-5 rounded-3xl bg-[#0b1226] border border-slate-800 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center space-x-2">
                      <Laptop className="w-4 h-4 text-blue-400" />
                      <span>Parque de Dispositivos por Tipo</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">Hardware vinculado en empresas</p>
                  </div>
                  <span className="text-xs font-black text-purple-400">
                    {metrics?.dispositivos_activos || 0} Activos
                  </span>
                </div>

                <div className="space-y-3 pt-2">
                  {[
                    { label: 'Tablets (Android / iPad)', count: metrics?.tablets_count || 0, color: 'from-purple-600 to-indigo-600', icon: Tablet },
                    { label: 'Computadoras de Escritorio (PC)', count: metrics?.pcs_count || 0, color: 'from-blue-600 to-cyan-500', icon: Monitor },
                    { label: 'Laptops y Portátiles', count: metrics?.laptops_count || 0, color: 'from-teal-600 to-emerald-500', icon: Laptop },
                    { label: 'Otros Equipos / Móviles', count: metrics?.otros_count || 0, color: 'from-slate-600 to-slate-500', icon: Smartphone }
                  ].map((row, idx) => {
                    const totalD = Math.max(1, metrics?.total_dispositivos || 1);
                    const pct = Math.round((row.count / totalD) * 100);
                    const Icon = row.icon;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-300 flex items-center space-x-2">
                            <Icon className="w-3.5 h-3.5 text-slate-400" />
                            <span>{row.label}</span>
                          </span>
                          <span className="font-mono text-white font-bold">{row.count} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                          <div
                            style={{ width: `${pct}%` }}
                            className={`h-full bg-gradient-to-r ${row.color} rounded-full transition-all duration-500`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Gráfico 4: Crecimiento Mensual de Empresas */}
              <div className="p-5 rounded-3xl bg-[#0b1226] border border-slate-800 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center space-x-2">
                      <Building2 className="w-4 h-4 text-cyan-400" />
                      <span>Crecimiento de Nuevas Empresas</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">Adquisición mensual de clientes</p>
                  </div>
                  <span className="text-xs font-black text-cyan-400">
                    +{metrics?.total_empresas || 0} Registradas
                  </span>
                </div>

                <div className="h-52 w-full flex flex-col justify-end pt-4">
                  {charts?.crecimiento_empresas && charts.crecimiento_empresas.length > 0 ? (
                    <div className="w-full h-full flex items-end justify-between space-x-3 px-2">
                      {charts.crecimiento_empresas.map((item, idx) => {
                        const maxE = Math.max(...charts.crecimiento_empresas.map(c => c.nuevas), 5);
                        const heightPct = Math.max(15, Math.round((item.nuevas / maxE) * 100));
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center group relative">
                            <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition duration-150 bg-slate-900 border border-slate-700 text-white text-[10px] font-bold py-1 px-2 rounded-lg pointer-events-none whitespace-nowrap z-20">
                              {item.nuevas} empresa{item.nuevas !== 1 ? 's' : ''}
                            </div>
                            <div
                              style={{ height: `${heightPct}%` }}
                              className="w-full max-w-[48px] rounded-t-xl bg-gradient-to-t from-blue-950 via-blue-600 to-cyan-400 border-t-2 border-cyan-300 transition-all duration-300 group-hover:scale-105 shadow-lg shadow-cyan-500/20"
                            />
                            <span className="text-[10px] font-bold text-slate-400 mt-2">{item.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-500">
                      Sin datos históricos de altas.
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 2. EMPRESAS (TABLA + ALTA + DETALLE DE 6 PESTAÑAS)              */}
        {/* ============================================================== */}
        {activeTab === 'empresas' && (
          <div className="space-y-5 animate-fade-in">
            {/* Barra de Acciones y Filtros */}
            <div className="p-4 bg-[#0b1226] border border-slate-800 rounded-2xl flex flex-wrap gap-3 justify-between items-center">
              <div className="flex items-center space-x-2 flex-1 min-w-[260px]">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar empresa por nombre o email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <select
                  value={filterEstado}
                  onChange={(e) => setFilterEstado(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none"
                >
                  <option value="">Todos los Estados</option>
                  <option value="ACTIVA">ACTIVA</option>
                  <option value="SUSPENDIDA">SUSPENDIDA</option>
                  <option value="INACTIVA">INACTIVA</option>
                </select>
              </div>

              <button
                onClick={() => setIsCreateEmpresaOpen(true)}
                className={`px-4 py-2.5 ${accentClasses.bg} ${accentClasses.hoverBg} text-white rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-lg ${accentClasses.shadow} cursor-pointer`}
              >
                <Plus className="w-4 h-4" />
                <span>+ Nueva Empresa</span>
              </button>
            </div>

            {/* Tabla de Empresas */}
            <div className="bg-[#0b1226] border border-slate-800 rounded-3xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#070e22] border-b border-slate-800 text-[10px] uppercase font-black tracking-wider text-slate-400">
                    <tr>
                      <th className="py-4 px-5">Empresa</th>
                      <th className="py-4 px-4">Plan Actual</th>
                      <th className="py-4 px-4">Estado</th>
                      <th className="py-4 px-4">Usuarios</th>
                      <th className="py-4 px-4">Dispositivos</th>
                      <th className="py-4 px-4">Próximo Pago</th>
                      <th className="py-4 px-5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {empresas.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-4 px-5">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-purple-400 shrink-0">
                              {emp.nombre.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-black text-white truncate">{emp.nombre}</p>
                              <p className="text-[11px] text-slate-400 truncate">{emp.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 font-semibold text-slate-200">
                          {emp.plan_nombre || 'Básico'}
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                            emp.estado === 'ACTIVA'
                              ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                              : 'bg-rose-950/80 text-rose-400 border-rose-500/40'
                          }`}>
                            {emp.estado}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-mono font-bold text-slate-300">
                          {emp.total_usuarios || 0}
                        </td>
                        <td className="py-4 px-4 font-mono font-bold text-purple-400">
                          {dispositivos.filter(d => d.empresa_id === emp.id && d.estado === 'ACTIVO').length} activos
                        </td>
                        <td className="py-4 px-4 font-mono text-slate-300">
                          {emp.fecha_proximo_pago || 'N/A'}
                        </td>
                        <td className="py-4 px-5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() => handleOpenEmpresaDetail(emp, 'resumen')}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                          >
                            Ver Detalles
                          </button>
                          <button
                            onClick={() => handleToggleEmpresaStatus(emp.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                              emp.estado === 'ACTIVA'
                                ? 'bg-amber-950/60 hover:bg-amber-900 text-amber-300 border border-amber-500/30'
                                : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {emp.estado === 'ACTIVA' ? 'Suspender' : 'Reactivar'}
                          </button>
                          <button
                            onClick={() => handleDeleteEmpresa(emp.id, emp.nombre)}
                            className="px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 hover:text-white border border-rose-500/40 rounded-xl text-xs font-bold transition cursor-pointer inline-flex items-center space-x-1"
                            title="Eliminar empresa permanentemente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Borrar</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 3. CENTRO GLOBAL DE DISPOSITIVOS                               */}
        {/* ============================================================== */}
        {activeTab === 'dispositivos' && (
          <div className="space-y-5 animate-fade-in">
            {/* 6 Tarjetas de Dispositivos */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3.5 bg-[#0b1226] border border-slate-800 rounded-2xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Totales</span>
                <p className="text-xl font-black text-white mt-1">{deviceStats?.total || 0}</p>
              </div>
              <div className="p-3.5 bg-[#0b1226] border border-slate-800 rounded-2xl">
                <span className="text-[10px] font-bold text-emerald-400 uppercase">Activos</span>
                <p className="text-xl font-black text-emerald-400 mt-1">{deviceStats?.activos || 0}</p>
              </div>
              <div className="p-3.5 bg-[#0b1226] border border-slate-800 rounded-2xl">
                <span className="text-[10px] font-bold text-amber-400 uppercase">Pendientes</span>
                <p className="text-xl font-black text-amber-400 mt-1">{deviceStats?.pendientes || 0}</p>
              </div>
              <div className="p-3.5 bg-[#0b1226] border border-slate-800 rounded-2xl">
                <span className="text-[10px] font-bold text-rose-400 uppercase">Bloqueados</span>
                <p className="text-xl font-black text-rose-400 mt-1">{deviceStats?.bloqueados || 0}</p>
              </div>
              <div className="p-3.5 bg-[#0b1226] border border-slate-800 rounded-2xl">
                <span className="text-[10px] font-bold text-purple-400 uppercase">Tablets</span>
                <p className="text-xl font-black text-purple-400 mt-1">{deviceStats?.tablets || 0}</p>
              </div>
              <div className="p-3.5 bg-[#0b1226] border border-slate-800 rounded-2xl">
                <span className="text-[10px] font-bold text-blue-400 uppercase">PCs</span>
                <p className="text-xl font-black text-blue-400 mt-1">{deviceStats?.pcs || 0}</p>
              </div>
            </div>

            {/* Barra de Filtros y Creación */}
            <div className="p-4 bg-[#0b1226] border border-slate-800 rounded-2xl flex flex-wrap gap-3 justify-between items-center">
              <div className="flex items-center space-x-2 flex-1 min-w-[280px]">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por dispositivo, código o empresa..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>

                <select
                  value={filterDeviceType}
                  onChange={(e) => setFilterDeviceType(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none"
                >
                  <option value="">Todos los Tipos</option>
                  <option value="Tablet">Tablet</option>
                  <option value="PC">PC</option>
                  <option value="Laptop">Laptop</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              <button
                onClick={() => setIsCreateDeviceOpen(true)}
                className={`px-4 py-2.5 ${accentClasses.bg} ${accentClasses.hoverBg} text-white rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-lg ${accentClasses.shadow} cursor-pointer`}
              >
                <Plus className="w-4 h-4" />
                <span>+ Crear Dispositivo con Código</span>
              </button>
            </div>

            {/* Código Generado Alert */}
            {createdCodeResult && (
              <div className="p-4 rounded-2xl bg-purple-950/70 border border-purple-500/50 flex justify-between items-center animate-scale-in">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600/30 flex items-center justify-center text-purple-300">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-purple-300 tracking-wider">Código de Activación Temporal</span>
                    <p className="text-base font-black text-white font-mono tracking-widest">{createdCodeResult.code}</p>
                    <p className="text-[11px] text-purple-200">Asignado a: {createdCodeResult.deviceName} (Vence en 48 horas).</p>
                  </div>
                </div>
                <button
                  onClick={() => setCreatedCodeResult(null)}
                  className="px-3 py-1 bg-purple-900/60 hover:bg-purple-800 text-white rounded-lg text-xs font-bold"
                >
                  Entendido
                </button>
              </div>
            )}

            {/* Tabla de Dispositivos */}
            <div className="bg-[#0b1226] border border-slate-800 rounded-3xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#070e22] border-b border-slate-800 text-[10px] uppercase font-black tracking-wider text-slate-400">
                    <tr>
                      <th className="py-4 px-5">Dispositivo</th>
                      <th className="py-4 px-4">Empresa</th>
                      <th className="py-4 px-4">Tipo</th>
                      <th className="py-4 px-4">Estado</th>
                      <th className="py-4 px-4">Código / Activación</th>
                      <th className="py-4 px-4">Última Conexión</th>
                      <th className="py-4 px-4">Versión</th>
                      <th className="py-4 px-5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {dispositivos.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-4 px-5">
                          <p className="font-black text-white">{d.nombre}</p>
                          <p className="text-[10px] font-mono text-slate-500">{d.uuid}</p>
                        </td>
                        <td className="py-4 px-4 font-semibold text-slate-300">
                          {d.empresa_nombre || 'Empresa #' + d.empresa_id}
                        </td>
                        <td className="py-4 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                            {d.tipo}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                            d.estado === 'ACTIVO'
                              ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                              : d.estado === 'BLOQUEADO'
                              ? 'bg-rose-950/80 text-rose-400 border-rose-500/40'
                              : 'bg-amber-950/80 text-amber-400 border-amber-500/40'
                          }`}>
                            {d.estado}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-mono text-slate-300">
                          {d.codigo_activacion ? (
                            <span className="px-2 py-1 bg-purple-950/80 text-purple-300 border border-purple-500/40 rounded-md font-bold tracking-wider">
                              {d.codigo_activacion}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              Activado: {d.fecha_activacion ? new Date(d.fecha_activacion).toLocaleDateString() : 'Sí'}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-slate-300 text-[11px]">
                          {d.ultima_conexion ? new Date(d.ultima_conexion).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca'}
                        </td>
                        <td className="py-4 px-4 font-mono text-slate-400">
                          {d.version_logixt || 'v1.0.4'}
                        </td>
                        <td className="py-4 px-5 text-right space-x-1">
                          {d.codigo_activacion ? (
                            <button
                              onClick={() => handleGenerateDeviceCode(d.id)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-purple-300 rounded-lg transition"
                              title="Regenerar código temporal"
                            >
                              <Key className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleDeviceStatus(d.id, d.estado === 'ACTIVO' ? 'BLOQUEADO' : 'ACTIVO')}
                              className={`p-1.5 rounded-lg transition ${
                                d.estado === 'ACTIVO'
                                  ? 'bg-rose-950/60 hover:bg-rose-900 text-rose-300'
                                  : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300'
                              }`}
                              title={d.estado === 'ACTIVO' ? 'Bloquear dispositivo' : 'Reactivar dispositivo'}
                            >
                              {d.estado === 'ACTIVO' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteDevice(d.id)}
                            className="p-1.5 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded-lg transition"
                            title="Revocar dispositivo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 4. SUSCRIPCIONES (LISTADO GLOBAL)                              */}
        {/* ============================================================== */}
        {activeTab === 'suscripciones' && (
          <div className="bg-[#0b1226] border border-slate-800 rounded-3xl overflow-hidden animate-fade-in">
            <div className="p-5 bg-[#070e22] border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-white">Suscripciones Globales de la Plataforma</h3>
                <p className="text-[11px] text-slate-400">Control de vigencias, renovaciones y estados de cobro</p>
              </div>
              <span className="text-xs font-bold text-slate-400">Total: {suscripciones.length} contratos</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#070e22] border-b border-slate-800 text-[10px] uppercase font-black tracking-wider text-slate-400">
                  <tr>
                    <th className="py-4 px-5">Empresa</th>
                    <th className="py-4 px-4">Plan</th>
                    <th className="py-4 px-4">Precio</th>
                    <th className="py-4 px-4">Estado</th>
                    <th className="py-4 px-4">Cupo Dispositivos</th>
                    <th className="py-4 px-4">Próximo Cobro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {suscripciones.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-4 px-5 font-bold text-white">
                        {sub.empresa_nombre}
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-200">
                        {sub.plan_nombre}
                      </td>
                      <td className="py-4 px-4 font-mono font-bold text-emerald-400">
                        ${sub.plan_precio || 79}.00 USD
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                          sub.estado === 'ACTIVE'
                            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                            : 'bg-amber-950/80 text-amber-400 border-amber-500/40'
                        }`}>
                          {sub.estado}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono text-purple-400">
                        {sub.dispositivos_activos || 0} / {sub.max_dispositivos || 3}
                      </td>
                      <td className="py-4 px-4 font-mono text-slate-300">
                        {sub.fecha_proximo_pago}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 5. PLANES COMERCIALES (GESTIÓN DE LÍMITES Y PRECIOS)           */}
        {/* ============================================================== */}
        {activeTab === 'planes' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {planes.map((p) => (
                <div
                  key={p.id}
                  className="p-6 rounded-3xl bg-[#0b1226] border border-slate-800 flex flex-col justify-between relative overflow-hidden"
                >
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 block">
                          Código: {p.codigo}
                        </span>
                        <h3 className="text-xl font-black text-white">{p.nombre}</h3>
                      </div>
                      <span className="text-2xl font-black text-white font-mono">
                        ${p.precio}<span className="text-xs text-slate-400">/m</span>
                      </span>
                    </div>

                    <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Límite de Dispositivos:</span>
                        <span className="font-bold text-purple-400">{p.max_dispositivos || 1} autorizado{p.max_dispositivos > 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Límite de Usuarios:</span>
                        <span className="font-bold text-white">{p.max_usuarios}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Almacenes:</span>
                        <span className="font-bold text-white">{p.max_almacenes}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setEditingPlan(p);
                      setPlanForm({
                        precio: p.precio,
                        max_usuarios: p.max_usuarios,
                        max_almacenes: p.max_almacenes,
                        max_dispositivos: p.max_dispositivos || 1
                      });
                    }}
                    className="w-full mt-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Configurar Límites del Plan</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Modal de Edición de Plan */}
            {editingPlan && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
                <div className="bg-[#0b1226] border border-[#172547] rounded-3xl max-w-md w-full p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-black text-white">Editar Plan {editingPlan.nombre}</h3>
                    <button onClick={() => setEditingPlan(null)} className="text-slate-400 hover:text-white">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Precio Mensual (USD)</label>
                      <input
                        type="number"
                        value={planForm.precio}
                        onChange={(e) => setPlanForm({ ...planForm, precio: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-purple-400 uppercase block mb-1">Límite de Dispositivos</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={planForm.max_dispositivos}
                        onChange={(e) => setPlanForm({ ...planForm, max_dispositivos: parseInt(e.target.value, 10) })}
                        className="w-full px-3 py-2 bg-slate-900 border border-purple-500/40 rounded-xl text-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Máximo de Usuarios</label>
                      <input
                        type="number"
                        min="1"
                        value={planForm.max_usuarios}
                        onChange={(e) => setPlanForm({ ...planForm, max_usuarios: parseInt(e.target.value, 10) })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2 pt-2">
                    <button onClick={() => setEditingPlan(null)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold">
                      Cancelar
                    </button>
                    <button onClick={handleSavePlanConfig} className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-black">
                      Guardar Límites
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* 6. PAGOS GLOBALES                                              */}
        {/* ============================================================== */}
        {activeTab === 'pagos' && (
          <div className="bg-[#0b1226] border border-slate-800 rounded-3xl overflow-hidden animate-fade-in">
            <div className="p-5 bg-[#070e22] border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-white">Transacciones y Cobros</h3>
                <p className="text-[11px] text-slate-400">Historial de pagos procesados y facturas generadas</p>
              </div>
              <span className="text-xs font-bold text-slate-400">Total: {pagos.length}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#070e22] border-b border-slate-800 text-[10px] uppercase font-black tracking-wider text-slate-400">
                  <tr>
                    <th className="py-4 px-5">ID Pago</th>
                    <th className="py-4 px-4">Empresa</th>
                    <th className="py-4 px-4">Monto</th>
                    <th className="py-4 px-4">Método</th>
                    <th className="py-4 px-4">Estado</th>
                    <th className="py-4 px-5">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {pagos.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-4 px-5 font-mono text-purple-400 font-bold">{p.payment_id}</td>
                      <td className="py-4 px-4 font-bold text-white">{p.empresa_nombre}</td>
                      <td className="py-4 px-4 font-mono font-bold text-emerald-400">${p.monto}.00 {p.moneda}</td>
                      <td className="py-4 px-4 text-slate-300">{p.metodo_pago || 'TARJETA'}</td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                          p.estado === 'PAGADO' ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40' : 'bg-rose-950/80 text-rose-400 border-rose-500/40'
                        }`}>
                          {p.estado}
                        </span>
                      </td>
                      <td className="py-4 px-5 font-mono text-slate-400">{p.fecha_pago}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 7. USUARIOS GLOBALES                                           */}
        {/* ============================================================== */}
        {activeTab === 'usuarios' && (
          <div className="bg-[#0b1226] border border-slate-800 rounded-3xl overflow-hidden animate-fade-in">
            <div className="p-5 bg-[#070e22] border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-white">Todos los Usuarios de la Plataforma</h3>
                <p className="text-[11px] text-slate-400">Cuentas activas en todas las empresas registradas</p>
              </div>
              <span className="text-xs font-bold text-slate-400">Total: {usuarios.length}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#070e22] border-b border-slate-800 text-[10px] uppercase font-black tracking-wider text-slate-400">
                  <tr>
                    <th className="py-4 px-5">Nombre y Apellido</th>
                    <th className="py-4 px-4">Usuario</th>
                    <th className="py-4 px-4">Empresa</th>
                    <th className="py-4 px-4">Rol</th>
                    <th className="py-4 px-4">Contacto</th>
                    <th className="py-4 px-5">Estado</th>
                    <th className="py-4 px-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {usuarios.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-4 px-5 font-bold text-white">
                        {u.nombre} {u.apellido || ''}
                      </td>
                      <td className="py-4 px-4 font-mono text-purple-400 font-bold">@{u.usuario}</td>
                      <td className="py-4 px-4 font-semibold text-slate-300">{u.empresa_nombre || 'Plataforma'}</td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.rol === 'SUPERADMIN' ? 'bg-purple-950 text-purple-300 border border-purple-500/40' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {u.rol}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-slate-400 text-[11px]">{u.email || u.telefono || 'Sin datos'}</td>
                      <td className="py-4 px-5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          u.estado === 'ACTIVO' ? 'text-emerald-400' : 'text-slate-500'
                        }`}>
                          {u.estado}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-right">
                        {u.id !== user?.id && u.rol !== 'SUPERADMIN' && (
                          <button
                            onClick={() => handleDeleteUser(u.id, u.nombre)}
                            className="p-1.5 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded-lg transition cursor-pointer"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 8. REPORTES Y RESUMEN EJECUTIVO                                */}
        {/* ============================================================== */}
        {activeTab === 'reportes' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-6 rounded-3xl bg-[#0b1226] border border-slate-800 space-y-4">
              <h3 className="text-base font-black text-white flex items-center space-x-2">
                <FileText className="w-5 h-5 text-purple-400" />
                <span>Informe Consolidado de la Plataforma SaaS Logixt</span>
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Resumen ejecutivo de volumen operativo, utilización de recursos de hardware y rendimiento financiero consolidado de todos los tenants.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">MRR Recurrente</span>
                  <p className="text-xl font-black text-emerald-400 mt-1">${metrics?.mrr || 0}.00 USD</p>
                  <p className="text-[10px] text-slate-500 mt-1">Facturación mensual proyectada</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Tasa de Operatividad</span>
                  <p className="text-xl font-black text-white mt-1">
                    {Math.round(((metrics?.empresas_activas || 1) / Math.max(1, metrics?.total_empresas || 1)) * 100)}%
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">Tenants al día sin suspensión</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Densidad de Dispositivos</span>
                  <p className="text-xl font-black text-purple-400 mt-1">
                    {((metrics?.total_dispositivos || 0) / Math.max(1, metrics?.total_empresas || 1)).toFixed(1)} disp / emp
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">Promedio de hardware por tenant</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Transacciones Almacén</span>
                  <p className="text-xl font-black text-cyan-400 mt-1">{metrics?.total_movimientos || 0}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Movimientos totales registrados</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 9. ACTIVIDAD Y AUDITORÍA GLOBAL EN TIEMPO REAL                 */}
        {/* ============================================================== */}
        {activeTab === 'actividad' && (
          <div className="bg-[#0b1226] border border-slate-800 rounded-3xl overflow-hidden animate-fade-in space-y-4 p-5">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-white flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Auditoría de Actividad y Eventos de Plataforma</span>
                </h3>
                <p className="text-[11px] text-slate-400">Historial cronológico de cambios críticos, activaciones y pagos</p>
              </div>
              <span className="text-xs font-bold text-slate-400">Últimos {actividadLogs.length} eventos</span>
            </div>

            <div className="space-y-2.5">
              {actividadLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start justify-between space-x-4 text-xs"
                >
                  <div className="flex items-start space-x-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-purple-950/80 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white">{log.accion}</span>
                        {log.empresa_nombre && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-purple-300 font-semibold">
                            {log.empresa_nombre}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5">{log.detalles}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Por: <strong className="text-slate-400">{log.usuario_nombre || 'Sistema'}</strong>
                      </p>
                    </div>
                  </div>

                  <span className="font-mono text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                    {new Date(log.fecha_hora).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 9.5 ALMACENAMIENTO Y GESTIÓN DE RESPALDOS MULTI-TENANT         */}
        {/* ============================================================== */}
        {activeTab === 'respaldos' && (
          <div className="space-y-6 animate-fade-in">
            {/* Tarjetas KPI de Respaldos */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 bg-[#0b1226] border border-slate-800 rounded-2xl flex items-center space-x-4">
                <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-semibold">Total Respaldos Globales</span>
                  <span className="text-2xl font-black text-white">{adminStorageStatus?.global?.total_respaldos_global || allBackups.length}</span>
                </div>
              </div>

              <div className="p-5 bg-[#0b1226] border border-slate-800 rounded-2xl flex items-center space-x-4">
                <div className="w-12 h-12 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                  <HardDrive className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-semibold">Espacio Ocupado en Servidor LOGIXT</span>
                  <span className="text-2xl font-black text-white">
                    {adminStorageStatus?.global?.bytes_globales 
                      ? `${(adminStorageStatus.global.bytes_globales / (1024 * 1024)).toFixed(2)} MB`
                      : '0 MB'}
                  </span>
                </div>
              </div>

              <div className="p-5 bg-[#0b1226] border border-slate-800 rounded-2xl flex items-center space-x-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-semibold">Empresas con Respaldo Activo</span>
                  <span className="text-2xl font-black text-emerald-400">
                    {adminStorageStatus?.empresas?.filter(e => e.total_respaldos > 0).length || 0} / {empresas.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Tabla de Empresas y Estado de Almacenamiento */}
            <div className="bg-[#0b1226] border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-white flex items-center space-x-2">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <span>Estado de Almacenamiento y Sincronización por Empresa</span>
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="pb-3 pl-2">Empresa</th>
                      <th className="pb-3">Modo</th>
                      <th className="pb-3">Motor Local</th>
                      <th className="pb-3">Estado Sync</th>
                      <th className="pb-3">Respaldos</th>
                      <th className="pb-3">Espacio</th>
                      <th className="pb-3">Último Respaldo</th>
                      <th className="pb-3 text-right pr-2">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(adminStorageStatus?.empresas || []).map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-3 pl-2 font-bold text-white">
                          {emp.nombre}
                        </td>
                        <td className="py-3 font-semibold text-slate-300">
                          {emp.modo === 'LOCAL_SYNC' ? 'Local-First' : emp.modo === 'CLOUD_MANAGED' ? 'Cloud-Native' : 'Por configurar'}
                        </td>
                        <td className="py-3 font-mono text-[11px] text-slate-400">
                          {emp.tipo_almacenamiento_local || 'N/A'}
                        </td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            emp.estado_sincronizacion === 'SINCRONIZADO' 
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-950/80 text-amber-300 border border-amber-500/30'
                          }`}>
                            {emp.estado_sincronizacion || 'SINCRONIZADO'}
                          </span>
                        </td>
                        <td className="py-3 font-bold text-slate-200">
                          {emp.total_respaldos}
                        </td>
                        <td className="py-3 font-mono text-slate-300">
                          {(emp.bytes_respaldos / 1024).toFixed(1)} KB
                        </td>
                        <td className="py-3 font-mono text-[11px] text-slate-400">
                          {emp.ultimo_respaldo ? new Date(emp.ultimo_respaldo).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Sin respaldos'}
                        </td>
                        <td className="py-3 text-right pr-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await api.storage.createBackup({ tipo: 'MANUAL', empresa_id: emp.id, detalles: `Respaldo forzado desde SuperAdmin para ${emp.nombre}` });
                                sound.playSuccess();
                                loadAll();
                              } catch (err: any) {
                                alert(err.message || 'Error al generar respaldo');
                              }
                            }}
                            className="px-2.5 py-1.5 bg-blue-600/30 hover:bg-blue-600 border border-blue-500/40 text-blue-300 hover:text-white rounded-lg text-[11px] font-bold transition cursor-pointer"
                          >
                            Forzar Respaldo
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Historial Consolidado de Respaldos */}
            <div className="bg-[#0b1226] border border-slate-800 rounded-3xl p-6 space-y-4">
              <h3 className="text-sm font-black text-white flex items-center space-x-2">
                <Database className="w-4 h-4 text-purple-400" />
                <span>Historial Consolidado de Respaldos en el Servidor</span>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="pb-3 pl-2">Fecha</th>
                      <th className="pb-3">Empresa</th>
                      <th className="pb-3">Tipo</th>
                      <th className="pb-3">Archivo</th>
                      <th className="pb-3">Tamaño</th>
                      <th className="pb-3">Registros</th>
                      <th className="pb-3 text-right pr-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {allBackups.slice(0, 30).map((b) => (
                      <tr key={b.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-2.5 pl-2 font-mono text-slate-300">
                          {new Date(b.fecha_creacion).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="py-2.5 font-bold text-white">{b.empresa_nombre || `Empresa #${b.empresa_id}`}</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            b.tipo === 'PREVENTIVO' ? 'bg-amber-950/80 text-amber-300' : 'bg-blue-950/80 text-blue-300'
                          }`}>
                            {b.tipo}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-[11px] text-slate-400 truncate max-w-xs">{b.nombre_archivo}</td>
                        <td className="py-2.5 font-mono text-slate-300">{(b.tamano_bytes / 1024).toFixed(1)} KB</td>
                        <td className="py-2.5 text-slate-400">{b.total_productos} prod / {b.total_movimientos} mov</td>
                        <td className="py-2.5 text-right pr-2 space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => void handleDownloadBackup(b.id)}
                            className="inline-flex items-center px-2 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded text-[11px] font-bold transition"
                            title="Descargar snapshot JSON"
                          >
                            <Download className="w-3.5 h-3.5 mr-1" />
                            <span>Descargar</span>
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(b.id, b.nombre_archivo)}
                            className="p-1 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded transition cursor-pointer"
                            title="Eliminar este respaldo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 10. CONFIGURACIÓN Y SIMULADOR DE WEBHOOKS                      */}
        {/* ============================================================== */}
        {activeTab === 'config' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
            {/* Parámetros Globales */}
            <div className="p-6 bg-[#0b1226] border border-slate-800 rounded-3xl space-y-4">
              <h3 className="text-sm font-black text-white flex items-center space-x-2">
                <Settings className="w-4 h-4 text-blue-400" />
                <span>Parámetros Globales de Suscripción</span>
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 uppercase block mb-1">
                    Días de Período de Gracia (Mora antes de Suspensión)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={diasGraciaInput}
                    onChange={(e) => setDiasGraciaInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Al vencer la factura, la empresa permanecerá en estado PAST_DUE durante estos días antes de bloquear el acceso operativo.
                  </span>
                </div>

                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black transition cursor-pointer"
                >
                  {savingConfig ? 'Guardando...' : 'Guardar Parámetros'}
                </button>
              </div>
            </div>

            <div className="p-6 bg-[#0b1226] border border-amber-500/30 rounded-3xl">
              <h3 className="text-sm font-black text-amber-300">Procesamiento de pagos deshabilitado</h3>
              <p className="text-xs text-slate-400 mt-2">
                Configura un proveedor de pagos antes de habilitar cobros, renovaciones o webhooks.
              </p>
            </div>
          </div>
        )}

      </div>

      {/* ============================================================== */}
      {/* MODAL 1: ALTA DE NUEVA EMPRESA                                 */}
      {/* ============================================================== */}
      {isCreateEmpresaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-[#0b1226] border border-[#172547] rounded-3xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black text-white">Alta de Nueva Empresa (Tenant)</h3>
              <button onClick={() => setIsCreateEmpresaOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEmpresa} className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nombre de la Empresa</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Distribuidora Central S.A."
                  value={newEmpresa.nombre}
                  onChange={(e) => setNewEmpresa({ ...newEmpresa, nombre: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Email Empresa</label>
                  <input
                    type="email"
                    required
                    placeholder="contacto@empresa.com"
                    value={newEmpresa.email}
                    onChange={(e) => setNewEmpresa({ ...newEmpresa, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Teléfono</label>
                  <input
                    type="text"
                    placeholder="+1 (809) 000-0000"
                    value={newEmpresa.telefono}
                    onChange={(e) => setNewEmpresa({ ...newEmpresa, telefono: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Plan Comercial Inicial</label>
                <select
                  value={newEmpresa.plan_id}
                  onChange={(e) => setNewEmpresa({ ...newEmpresa, plan_id: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                >
                  {planes.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre} (${p.precio} USD/m - {p.max_dispositivos || 1} disp)</option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-[11px] font-bold text-purple-400 block mb-2">Administrador Inicial de la Empresa</span>
                <div className="space-y-2">
                  <input
                    type="text"
                    required
                    placeholder="Nombre Completo del Administrador"
                    value={newEmpresa.admin_nombre}
                    onChange={(e) => setNewEmpresa({ ...newEmpresa, admin_nombre: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                  />
                  <input
                    type="email"
                    placeholder="Correo del administrador (opcional): recibirá un enlace para definir su contraseña"
                    value={newEmpresa.admin_email}
                    onChange={(e) => setNewEmpresa({ ...newEmpresa, admin_email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Usuario (Login)"
                      value={newEmpresa.admin_usuario}
                      onChange={(e) => setNewEmpresa({ ...newEmpresa, admin_usuario: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                    />
                    <input
                      type="password"
                      required
                      placeholder="Contraseña Inicial"
                      value={newEmpresa.admin_contrasena}
                      onChange={(e) => setNewEmpresa({ ...newEmpresa, admin_contrasena: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateEmpresaOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-black"
                >
                  Crear Empresa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: CREACIÓN DE DISPOSITIVO CON CÓDIGO TEMPORAL           */}
      {/* ============================================================== */}
      {isCreateDeviceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-[#0b1226] border border-[#172547] rounded-3xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black text-white flex items-center space-x-2">
                <Laptop className="w-5 h-5 text-purple-400" />
                <span>Crear Dispositivo para Empresa</span>
              </h3>
              <button onClick={() => setIsCreateDeviceOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDevice} className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Empresa Propietaria</label>
                <select
                  value={newDevice.empresa_id}
                  onChange={(e) => setNewDevice({ ...newDevice, empresa_id: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-bold"
                >
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>{e.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nombre del Dispositivo</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. TABLET-002 Almacén Frío"
                  value={newDevice.nombre}
                  onChange={(e) => setNewDevice({ ...newDevice, nombre: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tipo</label>
                  <select
                    value={newDevice.tipo}
                    onChange={(e) => setNewDevice({ ...newDevice, tipo: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                  >
                    <option value="PC">PC</option>
                    <option value="Tablet">Tablet</option>
                    <option value="Laptop">Laptop</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Sistema Operativo</label>
                  <input
                    type="text"
                    placeholder="Windows 11 / Android 14"
                    value={newDevice.sistema_operativo}
                    onChange={(e) => setNewDevice({ ...newDevice, sistema_operativo: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                  />
                </div>
              </div>

              <div className="p-3 bg-purple-950/40 border border-purple-500/30 rounded-xl text-[11px] text-purple-300">
                Se generará un código de activación temporal formato <strong>LGX-XXXX-XXXX</strong> válido por 48 horas de uso único.
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateDeviceOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-black"
                >
                  Generar Dispositivo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: DETALLE DE EMPRESA CON 6 PESTAÑAS                    */}
      {/* ============================================================== */}
      {selectedEmpresa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in font-sans">
          <div className="bg-[#0b1226] border border-[#172547] rounded-3xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            {/* Header del Modal */}
            <div className="px-6 py-5 bg-[#070e22] border-b border-slate-800 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-400 font-black">
                  {selectedEmpresa.nombre.charAt(0)}
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-purple-400 block tracking-wider">Detalle del Tenant</span>
                  <h3 className="text-base font-black text-white">{selectedEmpresa.nombre}</h3>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleDeleteEmpresa(selectedEmpresa.id, selectedEmpresa.nombre)}
                  className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                  title="Eliminar este tenant permanentemente"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar Empresa</span>
                </button>
                <button
                  onClick={() => setSelectedEmpresa(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Navegación de 6 Pestañas del Detalle de Empresa */}
            <div className="flex border-b border-slate-800 bg-[#070d1e] px-6 overflow-x-auto no-scrollbar shrink-0">
              {[
                { id: 'resumen', label: 'Resumen' },
                { id: 'usuarios', label: `Usuarios (${empresaUsers.length})` },
                { id: 'dispositivos', label: `Dispositivos (${empresaDevices.length})` },
                { id: 'suscripcion', label: 'Suscripción' },
                { id: 'pagos', label: `Pagos (${empresaPayments.length})` },
                { id: 'actividad', label: `Actividad (${empresaActivity.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setEmpresaDetailTab(tab.id as any)}
                  className={`py-3 px-4 font-bold text-xs border-b-2 whitespace-nowrap transition cursor-pointer ${
                    empresaDetailTab === tab.id
                      ? 'border-purple-500 text-purple-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Contenido de la Pestaña */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {loadingEmpresaDetail ? (
                <div className="py-12 flex justify-center"><div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : (
                <>
                  {/* PESTAÑA: RESUMEN */}
                  {empresaDetailTab === 'resumen' && (
                    <div className="space-y-4 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Plan</span>
                          <span className="font-black text-white">{selectedEmpresa.plan_nombre}</span>
                        </div>
                        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Estado</span>
                          <span className="font-bold text-emerald-400">{selectedEmpresa.estado}</span>
                        </div>
                        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Dispositivos</span>
                          <span className="font-bold text-purple-400">{empresaDevices.filter(d => d.estado === 'ACTIVO').length} activos</span>
                        </div>
                        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Próximo Pago</span>
                          <span className="font-mono text-white">{selectedEmpresa.fecha_proximo_pago || 'N/A'}</span>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-900/40 rounded-2xl border border-slate-800 space-y-2">
                        <p><strong className="text-slate-300">Email:</strong> {selectedEmpresa.email}</p>
                        <p><strong className="text-slate-300">Teléfono:</strong> {selectedEmpresa.telefono || 'Sin registrar'}</p>
                        <p><strong className="text-slate-300">Fecha de Alta:</strong> {selectedEmpresa.fecha_creacion}</p>
                      </div>
                    </div>
                  )}

                  {/* PESTAÑA: USUARIOS */}
                  {empresaDetailTab === 'usuarios' && (
                    <div className="space-y-2">
                      {empresaUsers.map((u) => (
                        <div key={u.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-white">{u.nombre} {u.apellido || ''}</span>
                            <span className="text-[10px] text-slate-400 font-mono ml-2">@{u.usuario}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-purple-300">
                              {u.rol}
                            </span>
                            {u.id !== user?.id && u.rol !== 'SUPERADMIN' && (
                              <button
                                onClick={() => handleDeleteUser(u.id, u.nombre)}
                                className="p-1 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded transition cursor-pointer"
                                title="Eliminar usuario"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* PESTAÑA: DISPOSITIVOS */}
                  {empresaDetailTab === 'dispositivos' && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-300">Dispositivos de {selectedEmpresa.nombre}</span>
                        <button
                          onClick={() => {
                            setNewDevice({ ...newDevice, empresa_id: selectedEmpresa.id });
                            setIsCreateDeviceOpen(true);
                          }}
                          className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold"
                        >
                          + Agregar Dispositivo
                        </button>
                      </div>

                      <div className="space-y-2">
                        {empresaDevices.map((d) => (
                          <div key={d.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex justify-between items-center text-xs">
                            <div>
                              <p className="font-bold text-white">{d.nombre}</p>
                              <p className="text-[10px] text-slate-400">{d.tipo} · {d.sistema_operativo || 'N/A'}</p>
                              {d.codigo_activacion && (
                                <span className="font-mono text-[10px] text-purple-400">Código: {d.codigo_activacion}</span>
                              )}
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              d.estado === 'ACTIVO' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
                            }`}>
                              {d.estado}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* PESTAÑA: SUSCRIPCIÓN */}
                  {empresaDetailTab === 'suscripcion' && (
                    <div className="space-y-4 text-xs">
                      <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-white text-sm">{selectedEmpresa.plan_nombre}</span>
                          <span className="font-mono text-emerald-400 font-bold">${selectedEmpresa.plan_precio || 79}.00 USD / mes</span>
                        </div>
                        <p className="text-slate-400">Próximo vencimiento: <strong>{selectedEmpresa.fecha_proximo_pago || 'N/A'}</strong></p>
                      </div>

                      <div className="flex space-x-2">
                        <button
                          onClick={() => setDetailModalMode('plan')}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold"
                        >
                          Cambiar Plan Comercial
                        </button>
                        <button
                          onClick={() => setDetailModalMode('extend')}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold"
                        >
                          Prorrogar Suscripción
                        </button>
                      </div>

                      {detailModalMode === 'plan' && (
                        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2 animate-scale-in">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Seleccionar Nuevo Plan</label>
                          <select
                            value={targetPlanId}
                            onChange={(e) => setTargetPlanId(Number(e.target.value))}
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                          >
                            {planes.map((p) => (
                              <option key={p.id} value={p.id}>{p.nombre} (${p.precio} USD/m)</option>
                            ))}
                          </select>
                          <button onClick={handleChangePlanSubmit} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold">
                            Aplicar Cambio
                          </button>
                        </div>
                      )}

                      {detailModalMode === 'extend' && (
                        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2 animate-scale-in">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Extender días adicionales</label>
                          <input
                            type="number"
                            value={extendDays}
                            onChange={(e) => setExtendDays(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                          />
                          <button onClick={handleExtendSubscriptionSubmit} className="px-4 py-1.5 bg-purple-600 text-white rounded-lg font-bold">
                            Confirmar Extensión
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* PESTAÑA: PAGOS */}
                  {empresaDetailTab === 'pagos' && (
                    <div className="space-y-2 text-xs">
                      {empresaPayments.map((p) => (
                        <div key={p.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex justify-between items-center">
                          <div>
                            <span className="font-mono text-purple-400">{p.payment_id}</span>
                            <span className="text-slate-400 ml-2">({p.metodo_pago})</span>
                          </div>
                          <span className="font-mono font-bold text-emerald-400">${p.monto}.00 USD</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* PESTAÑA: ACTIVIDAD */}
                  {empresaDetailTab === 'actividad' && (
                    <div className="space-y-2 text-xs">
                      {empresaActivity.map((a) => (
                        <div key={a.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex justify-between items-start">
                          <div>
                            <span className="font-bold text-white">{a.accion}</span>
                            <p className="text-[11px] text-slate-300 mt-0.5">{a.detalles}</p>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500">{a.fecha_hora}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
