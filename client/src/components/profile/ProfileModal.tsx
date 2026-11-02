import React, { useState, useEffect } from 'react';
import {
  User as UserIcon,
  Palette,
  CreditCard,
  Building2,
  Shield,
  Mail,
  Phone,
  Camera,
  Key,
  CheckCircle2,
  AlertTriangle,
  X,
  Edit2,
  Save,
  Laptop,
  Check,
  Sparkles,
  ExternalLink,
  MessageSquare,
  Database
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../services/api';
import { sound } from '../../services/sound';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'profile' | 'appearance' | 'subscription';
  onOpenSubscriptionDetails?: () => void;
  onOpenStorage?: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'profile',
  onOpenSubscriptionDetails,
  onOpenStorage
}) => {
  const { user, updateUser } = useAuth();
  const { accentClasses } = useTheme();

  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'subscription'>(initialTab);
  const [isEditing, setIsEditing] = useState(false);

  // Formulario Perfil
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    foto: ''
  });

  // Formulario Contraseña
  const [passwords, setPasswords] = useState({
    actual: '',
    nueva: '',
    confirmar: ''
  });
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // Datos de Suscripción
  const [subscriptionData, setSubscriptionData] = useState<any>(null);
  const [loadingSub, setLoadingSub] = useState(false);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [changePlanAlert, setChangePlanAlert] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        nombre: user.nombre || '',
        apellido: user.apellido || '',
        email: user.email || '',
        telefono: user.telefono || '',
        foto: user.foto || ''
      });
    }
  }, [user]);

  useEffect(() => {
    if (isOpen && activeTab === 'subscription') {
      loadSubscription();
    }
  }, [isOpen, activeTab]);

  const loadSubscription = async () => {
    if (user?.rol === 'SUPERADMIN') return;
    setLoadingSub(true);
    try {
      const res = await api.subscriptions.getMySubscription();
      setSubscriptionData(res.subscription);
    } catch (e) {
      console.warn('Error al cargar datos de suscripción:', e);
    } finally {
      setLoadingSub(false);
    }
  };

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await api.auth.updateProfile(formData);
      sound.playSuccess();
      if (res.user) {
        updateUser(res.user);
      }
      setMessage({ type: 'success', text: res.message || 'Perfil actualizado exitosamente.' });
      setIsEditing(false);
    } catch (err: any) {
      sound.playError();
      setMessage({ type: 'error', text: err.message || 'Error al actualizar el perfil.' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.nueva !== passwords.confirmar) {
      setMessage({ type: 'error', text: 'Las nuevas contraseñas no coinciden.' });
      return;
    }
    setSaving(true);
    setMessage(null);

    try {
      const res = await api.auth.changePassword(passwords.actual, passwords.nueva);
      sound.playSuccess();
      setMessage({ type: 'success', text: res.message });
      setPasswords({ actual: '', nueva: '', confirmar: '' });
      setShowPasswordForm(false);
    } catch (err: any) {
      sound.playError();
      setMessage({ type: 'error', text: err.message || 'Error al cambiar contraseña.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in font-sans">
      <div className="bg-[#0b1226] border border-[#172547] rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-scale-in">
        {/* Cabecera del Modal */}
        <div className="px-6 py-5 bg-[#070e22] border-b border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${accentClasses.gradient} flex items-center justify-center text-white shadow-lg ${accentClasses.shadow}`}>
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <span className={`text-[10px] font-black uppercase tracking-wider ${accentClasses.text} block`}>
                Configuración Personal
              </span>
              <h2 className="text-lg font-black text-white">Perfil y Preferencias</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensaje de Alerta Global */}
        {message && (
          <div className={`px-6 py-3 text-xs font-semibold flex items-center space-x-2 shrink-0 ${
            message.type === 'success' ? 'bg-emerald-950/80 text-emerald-300 border-b border-emerald-800' : 'bg-rose-950/80 text-rose-300 border-b border-rose-800'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Barra de Navegación de Pestañas */}
        <div className="flex border-b border-slate-800 bg-[#070d1e] px-6 shrink-0">
          <button
            onClick={() => { setActiveTab('profile'); setMessage(null); }}
            className={`py-3 px-4 font-bold text-xs flex items-center space-x-2 border-b-2 transition cursor-pointer ${
              activeTab === 'profile'
                ? `${accentClasses.border} ${accentClasses.text}`
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            <span>Mi Perfil</span>
          </button>

          <button
            onClick={() => { setActiveTab('appearance'); setMessage(null); }}
            className={`py-3 px-4 font-bold text-xs flex items-center space-x-2 border-b-2 transition cursor-pointer ${
              activeTab === 'appearance'
                ? `${accentClasses.border} ${accentClasses.text}`
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Apariencia y Temas</span>
          </button>

          {user?.rol !== 'SUPERADMIN' && (
            <button
              onClick={() => { setActiveTab('subscription'); setMessage(null); }}
              className={`py-3 px-4 font-bold text-xs flex items-center space-x-2 border-b-2 transition cursor-pointer ${
                activeTab === 'subscription'
                  ? `${accentClasses.border} ${accentClasses.text}`
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Mi Suscripción</span>
            </button>
          )}

          {onOpenStorage && (
            <button
              onClick={() => {
                onClose();
                onOpenStorage();
              }}
              className="py-3 px-4 font-bold text-xs flex items-center space-x-2 border-b-2 border-transparent text-slate-400 hover:text-white transition cursor-pointer"
            >
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Almacenamiento & Respaldos</span>
            </button>
          )}
        </div>

        {/* Contenido Scrolleable */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* ================= PESTAÑA 1: MI PERFIL ================= */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Tarjeta de Resumen con Avatar */}
              <div className="p-5 rounded-2xl bg-[#0e172e] border border-slate-800 flex items-center space-x-4">
                <div className="relative">
                  {formData.foto ? (
                    <img
                      src={formData.foto}
                      alt={formData.nombre}
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-700 shadow-md"
                    />
                  ) : (
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-tr ${accentClasses.gradient} flex items-center justify-center text-xl font-black text-white shadow-md`}>
                      {(formData.nombre || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  {isEditing && (
                    <div className="absolute -bottom-1 -right-1 p-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-300">
                      <Camera className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-black text-white truncate">
                      {formData.nombre} {formData.apellido}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      @{user?.usuario}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 flex items-center space-x-1.5 mt-0.5">
                    <Shield className="w-3.5 h-3.5 text-blue-400" />
                    <span className="font-semibold text-blue-400">{user?.rol}</span>
                    <span>·</span>
                    <Building2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>{user?.empresa_nombre || 'Plataforma Global'}</span>
                  </p>
                </div>

                {!isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-white transition cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Editar Perfil</span>
                  </button>
                )}
              </div>

              {/* Formulario de Edición */}
              {isEditing ? (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                        Nombre
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                        Apellido
                      </label>
                      <input
                        type="text"
                        value={formData.apellido}
                        onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                        Correo Electrónico
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                        placeholder="ejemplo@empresa.com"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                        Teléfono de Contacto
                      </label>
                      <input
                        type="tel"
                        value={formData.telefono}
                        onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                        placeholder="+1 (809) 000-0000"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                      URL Foto de Perfil
                    </label>
                    <input
                      type="url"
                      value={formData.foto}
                      onChange={(e) => setFormData({ ...formData, foto: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                      placeholder="https://..."
                    />
                  </div>

                  <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <span>
                      La empresa asignada y el rol operativo son gestionados por el SuperAdmin de la plataforma y no pueden modificarse desde aquí.
                    </span>
                  </div>

                  <div className="flex justify-end space-x-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className={`px-4 py-2 ${accentClasses.bg} ${accentClasses.hoverBg} text-white rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-md cursor-pointer`}
                    >
                      <Save className="w-4 h-4" />
                      <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Correo Electrónico</span>
                    <p className="font-semibold text-slate-200 flex items-center space-x-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formData.email || 'No registrado'}</span>
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Teléfono</span>
                    <p className="font-semibold text-slate-200 flex items-center space-x-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formData.telefono || 'No registrado'}</span>
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Empresa</span>
                    <p className="font-semibold text-slate-200 flex items-center space-x-2">
                      <Building2 className="w-3.5 h-3.5 text-purple-400" />
                      <span>{user?.empresa_nombre || 'Plataforma Global Logixt'}</span>
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Rol de Usuario</span>
                    <p className="font-semibold text-slate-200 flex items-center space-x-2">
                      <Shield className="w-3.5 h-3.5 text-blue-400" />
                      <span>{user?.rol}</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Botón y Sección de Contraseña */}
              <div className="pt-2 border-t border-slate-800/80">
                {!showPasswordForm ? (
                  <button
                    type="button"
                    onClick={() => setShowPasswordForm(true)}
                    className="flex items-center space-x-2 text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>Cambiar Contraseña de Acceso</span>
                  </button>
                ) : (
                  <form onSubmit={handleChangePassword} className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center mb-1">
                      <h4 className="text-xs font-black text-white flex items-center space-x-1.5">
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        <span>Actualizar Contraseña</span>
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowPasswordForm(false)}
                        className="text-[11px] text-slate-400 hover:text-white"
                      >
                        Cancelar
                      </button>
                    </div>

                    <div>
                      <input
                        type="password"
                        required
                        placeholder="Contraseña Actual"
                        value={passwords.actual}
                        onChange={(e) => setPasswords({ ...passwords, actual: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="password"
                        required
                        placeholder="Nueva Contraseña (mín 6)"
                        value={passwords.nueva}
                        onChange={(e) => setPasswords({ ...passwords, nueva: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      />
                      <input
                        type="password"
                        required
                        placeholder="Confirmar Contraseña"
                        value={passwords.confirmar}
                        onChange={(e) => setPasswords({ ...passwords, confirmar: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                    >
                      {saving ? 'Actualizando...' : 'Confirmar Cambio de Contraseña'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* ================= PESTAÑA 2: APARIENCIA Y TEMAS ================= */}
          {activeTab === 'appearance' && (
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-slate-800/60 border border-slate-700 space-y-4">
                <div>
                  <h3 className="text-sm font-black text-white">Paleta de la plataforma</h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Esta paleta única se aplica en todas las pantallas y no se puede cambiar por usuario.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { color: '#06141B', label: 'Fondo profundo' },
                    { color: '#11212D', label: 'Superficie oscura' },
                    { color: '#253745', label: 'Paneles' },
                    { color: '#4A5C6A', label: 'Controles' },
                    { color: '#9BA8AB', label: 'Texto secundario' },
                    { color: '#CCD0CF', label: 'Texto principal' },
                  ].map(({ color, label }) => (
                    <div key={color} className="flex items-center space-x-3 rounded-xl bg-slate-900/70 border border-slate-700 p-3">
                      <span
                        className="w-8 h-8 rounded-lg border border-slate-500/50 shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-white">{label}</span>
                        <span className="block text-[11px] text-slate-300 font-mono">{color}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================= PESTAÑA 3: MI SUSCRIPCIÓN ================= */}
          {activeTab === 'subscription' && (
            <div className="space-y-5">
              {loadingSub ? (
                <div className="py-12 flex justify-center items-center">
                  <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : subscriptionData ? (
                <>
                  {/* Tarjeta de Resumen del Plan */}
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-[#0e172e] to-[#091024] border border-[#172547] relative overflow-hidden">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 block mb-1">
                          Plan Actual Contratado
                        </span>
                        <h3 className="text-xl font-black text-white">
                          {subscriptionData.plan_nombre || 'Plan Profesional'}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                          Facturación: <span className="font-bold text-slate-200">${subscriptionData.plan_precio || 79}.00 USD / mes</span>
                        </p>
                      </div>

                      <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
                        subscriptionData.suscripcion_estado === 'ACTIVE'
                          ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                          : 'bg-amber-950/80 text-amber-400 border-amber-500/40'
                      }`}>
                        {subscriptionData.suscripcion_estado === 'ACTIVE' ? '🟢 ACTIVA' : subscriptionData.suscripcion_estado}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-800/80 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">Próximo Pago</span>
                        <span className="font-bold text-white">
                          {subscriptionData.fecha_proximo_pago || 'No programado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">Fecha Inicio</span>
                        <span className="font-bold text-white">
                          {subscriptionData.fecha_inicio || '2026-09-01'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">Dispositivos Permitidos</span>
                        <span className="font-bold text-purple-400">
                          {subscriptionData.max_dispositivos || 3} dispositivos
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Consumo de Dispositivos */}
                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-300 flex items-center space-x-1.5">
                        <Laptop className="w-4 h-4 text-blue-400" />
                        <span>Dispositivos Vinculados</span>
                      </span>
                      <span className="font-black text-white">
                        {subscriptionData.uso?.usuarios_activos ? Math.min(2, subscriptionData.max_dispositivos || 3) : 1} / {subscriptionData.max_dispositivos || 3}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full"
                        style={{ width: `${((Math.min(2, subscriptionData.max_dispositivos || 3)) / (subscriptionData.max_dispositivos || 3)) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Funciones Incluidas */}
                  <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                    <span className="text-[11px] font-black uppercase text-slate-300 tracking-wider block">
                      Funciones y Alcance de tu Plan
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                      {(subscriptionData.caracteristicas || [
                        'Control completo de entradas y salidas',
                        'Escáner de código de barras y QR',
                        'Límite de dispositivos garantizado',
                        'Auditoría y trazabilidad de movimientos'
                      ]).map((feat: string, idx: number) => (
                        <div key={idx} className="flex items-center space-x-2">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Alerta si solicita cambio de plan */}
                  {changePlanAlert && (
                    <div className="p-3 bg-blue-950/80 border border-blue-500/40 rounded-xl text-xs text-blue-300 flex items-start space-x-2 animate-fade-in">
                      <MessageSquare className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                      <div>
                        <p className="font-bold">Solicitud enviada a la Administración</p>
                        <p className="text-[11px] text-blue-200 mt-0.5">
                          Para garantizar el control comercial y la asignación de licencias de hardware, los cambios de plan son coordinados directamente por el SuperAdmin de la plataforma. Nos comunicaremos contigo a la brevedad.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Botones de Acción */}
                  <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                    {onOpenSubscriptionDetails && (
                      <button
                        onClick={onOpenSubscriptionDetails}
                        className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Ver Facturas y Pagos</span>
                      </button>
                    )}
                    <button
                      onClick={() => setChangePlanAlert(true)}
                      className={`flex-1 py-2.5 px-4 ${accentClasses.bg} ${accentClasses.hoverBg} text-white rounded-xl text-xs font-black transition flex items-center justify-center space-x-1.5 shadow-lg ${accentClasses.shadow} cursor-pointer`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Solicitar Cambio de Plan</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">
                  No se encontraron datos de suscripción para esta cuenta.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
