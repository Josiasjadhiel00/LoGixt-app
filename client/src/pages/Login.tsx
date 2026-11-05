import React, { useState } from 'react';
import {
  Lock,
  User as UserIcon,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  Package,
  ShieldCheck,
  Zap,
  KeyRound,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { firebaseAuth } from '../services/firebase';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuario.trim() || !contrasena) {
      setError('Por favor ingrese su usuario y contraseña.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await login(usuario.trim(), contrasena);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al iniciar sesión.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    const email = usuario.trim();
    if (!email.includes('@')) {
      setError('Ingresa el correo electrónico asociado a tu cuenta para restablecer la contraseña.');
      return;
    }

    setIsSendingReset(true);
    setError(null);
    try {
      await api.auth.sendPasswordReset(email);
      setResetSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el correo de restablecimiento.');
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050914] flex items-center justify-center p-4 sm:p-8 lg:p-12 relative overflow-hidden font-sans select-none">
      {/* Background Warehouse Image with Ambient Tint */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <img
          src="/warehouse_bg.jpg"
          alt="Logistics Warehouse"
          className="w-full h-full object-cover opacity-20 sm:opacity-25"
        />
        {/* Deep Gradient Overlays for High Contrast and Futuristic Atmosphere */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#050914] via-[#050914]/80 to-[#050914]/90" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050914] via-transparent to-[#050914]" />

        {/* Ambient Neon Glows matching user mockup */}
        <div className="absolute -top-32 -left-32 w-96 sm:w-[550px] h-96 sm:h-[550px] bg-blue-600/20 rounded-full blur-[140px]" />
        <div className="absolute -bottom-32 -right-32 w-96 sm:w-[550px] h-96 sm:h-[550px] bg-purple-600/20 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-80 h-80 bg-cyan-500/10 rounded-full blur-[120px]" />
      </div>

      {/* Main Container - 2 Columns Layout */}
      <div className="max-w-7xl w-full flex flex-col lg:grid lg:grid-cols-12 gap-8 lg:gap-14 items-center justify-center relative z-10">
        
        {/* Left Column: Brand & Value Propositions */}
        <div className="hidden lg:flex lg:col-span-7 flex-col justify-between space-y-8 lg:space-y-10 py-4">
          
          {/* Logo Header */}
          <div className="flex items-center space-x-3.5">
            <div className="relative w-12 h-12 rounded-2xl p-0.5 bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 shadow-lg shadow-blue-500/30 shrink-0">
              <div className="w-full h-full bg-[#080f24] rounded-[14px] flex items-center justify-center overflow-hidden">
                <img
                  src="/logo.jpg"
                  alt="LOGIXT"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <div>
              <div className="text-white font-black text-2xl tracking-wider flex items-center">
                <span>LOGI</span>
                <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">X</span>
                <span>T</span>
              </div>
              <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                Sistema SaaS de Gestión de Almacenes
              </p>
            </div>
          </div>

          {/* Hero Headline */}
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-black text-white leading-[1.08] tracking-tight">
              Tu almacén.<br />
              Bajo <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-500 bg-clip-text text-transparent">control.</span>
            </h1>
            <p className="text-slate-400 text-sm sm:text-base max-w-lg leading-relaxed font-normal">
              Gestiona tus inventarios, supervisa tus operaciones y mantén el control desde un solo lugar.
            </p>
          </div>

          {/* 3 Feature Items */}
          <div className="space-y-4 sm:space-y-5">
            {/* Item 1 */}
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-950/70 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-md shadow-blue-950/50 shrink-0">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm sm:text-base">
                  Inventario en tiempo real
                </h3>
                <p className="text-xs sm:text-sm text-slate-400">
                  Siempre al día, siempre disponible.
                </p>
              </div>
            </div>

            {/* Item 2 */}
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-950/70 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-md shadow-blue-950/50 shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm sm:text-base">
                  Operaciones seguras
                </h3>
                <p className="text-xs sm:text-sm text-slate-400">
                  Tu información, protegida.
                </p>
              </div>
            </div>

            {/* Item 3 */}
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-950/70 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-md shadow-blue-950/50 shrink-0">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm sm:text-base">
                  Mayor productividad
                </h3>
                <p className="text-xs sm:text-sm text-slate-400">
                  Procesos más simples, mejores resultados.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Security Badge */}
          <div className="pt-2">
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-blue-950/60 border border-blue-500/30 text-blue-300 text-xs shadow-inner">
              <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Acceso exclusivo para personal autorizado.</span>
            </div>
          </div>
        </div>

        {/* Right Column: Floating Glassmorphism Login Card */}
        <div className="w-full lg:col-span-5 flex justify-center lg:justify-end">
          <div className="w-full max-w-md lg:max-w-[460px] bg-[#070e24]/85 backdrop-blur-2xl border border-blue-500/35 rounded-[32px] p-7 sm:p-9 shadow-[0_0_60px_rgba(20,60,180,0.28)] relative overflow-hidden">
            
            {/* Top Glow Edge */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-purple-500 opacity-60" />

            {/* Mini Logo inside Card */}
            <div className="flex items-center space-x-3">
              <div className="relative w-10 h-10 rounded-xl p-0.5 bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 shadow-md shadow-blue-500/20 shrink-0">
                <div className="w-full h-full bg-[#080f24] rounded-[10px] flex items-center justify-center overflow-hidden">
                  <img
                    src="/logo.jpg"
                    alt="LOGIXT"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div>
                <div className="text-white font-black text-lg tracking-wider flex items-center">
                  <span>LOGI</span>
                  <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">X</span>
                  <span>T</span>
                </div>
                <p className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">
                  Sistema SaaS de Gestión de Almacenes
                </p>
              </div>
            </div>

            {/* Greeting */}
            <div className="mt-7 mb-6">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Bienvenido de nuevo
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1.5 font-normal">
                Ingresa tus credenciales para acceder a tu cuenta.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-5 p-3.5 bg-red-950/80 border border-red-500/50 rounded-xl flex items-center space-x-2.5 text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Field: Usuario o correo electrónico */}
              <div>
                <label className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300 mb-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>Usuario o correo electrónico</span>
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="Ingresa tu usuario o correo"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-[#050a1a]/95 border border-slate-700/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-white placeholder-slate-500 text-sm transition outline-none font-mono"
                  />
                </div>
              </div>

              {/* Field: Contraseña */}
              <div>
                <label className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300 mb-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Contraseña</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Ingresa tu contraseña"
                    value={contrasena}
                    onChange={(e) => setContrasena(e.target.value)}
                    className="w-full pl-10 pr-11 py-3 bg-[#050a1a]/95 border border-slate-700/80 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-white placeholder-slate-500 text-sm transition outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                    title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Forgot password link */}
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setResetSent(false);
                    setShowForgotModal(true);
                  }}
                  className="text-xs font-semibold text-purple-400 hover:text-purple-300 transition cursor-pointer"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white font-bold text-sm sm:text-base flex items-center justify-center space-x-2 shadow-xl shadow-blue-600/30 hover:shadow-purple-600/40 transition duration-200 disabled:opacity-50 cursor-pointer"
              >
                <span>{isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Card Footer */}
            <div className="mt-8 pt-4 border-t border-slate-800/60 flex items-center justify-center space-x-2 text-[11px] text-slate-400 text-center">
              <Lock className="w-3.5 h-3.5 shrink-0 text-slate-500" />
              <span>Acceso restringido exclusivamente a personal autorizado del almacén.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Informativo: ¿Olvidaste tu contraseña? */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#0a122c] border border-blue-500/40 rounded-2xl p-6 shadow-2xl space-y-4 relative">
            <button
              onClick={() => setShowForgotModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-xl bg-purple-950/80 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <KeyRound className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">¿Olvidaste tu contraseña?</h3>
              {firebaseAuth ? (
                resetSent ? (
                  <p className="text-xs text-emerald-300 mt-2 leading-relaxed">
                    Si existe una cuenta Firebase con ese correo, recibirás instrucciones para restablecer la contraseña.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                      Ingresa tu correo en el formulario de acceso y solicita un enlace seguro de restablecimiento.
                    </p>
                    <button
                      onClick={() => void handlePasswordReset()}
                      disabled={isSendingReset}
                      className="w-full mt-4 py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
                    >
                      {isSendingReset ? 'Enviando...' : 'Enviar enlace de restablecimiento'}
                    </button>
                  </>
                )
              ) : (
                <>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    El restablecimiento de contraseñas es gestionado por el administrador de tu empresa o el SuperAdmin.
                  </p>
                  <p className="text-xs text-slate-400 mt-2">
                    Comunícate con tu supervisor o el soporte técnico interno para obtener ayuda.
                  </p>
                </>
              )}
            </div>

            <button
              onClick={() => setShowForgotModal(false)}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
