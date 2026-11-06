import React, { useState, useEffect } from 'react';
import { Users, Plus, ShieldCheck, User as UserIcon, Lock, X, AlertCircle, Trash2 } from 'lucide-react';
import { User, UserRole } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Formulario nuevo usuario
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<UserRole>('ALMACENERO');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal restablecer contraseña
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const res = await api.users.getAll();
      setUsers(res.users);
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await api.users.create({
        nombre,
        usuario,
        contrasena,
        rol,
        ...(email.trim() ? { email: email.trim() } : {}),
      });

      if (res.firebase) {
        alert(res.message);
      }

      setNombre('');
      setUsuario('');
      setContrasena('');
      setEmail('');
      setRol('ALMACENERO');
      setIsModalOpen(false);
      loadUsers();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al registrar usuario.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await api.users.toggleStatus(user.id);
      loadUsers();
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message);
      }
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`¿Está seguro de eliminar permanentemente al usuario "${user.nombre}" (@${user.usuario})?`)) {
      return;
    }
    try {
      await api.users.delete(user.id);
      loadUsers();
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message);
      }
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId || !newPassword) return;

    try {
      await api.users.resetPassword(resetUserId, newPassword);
      setResetUserId(null);
      setNewPassword('');
      alert('Contraseña actualizada con éxito.');
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message);
      }
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center space-x-2">
            <Users className="w-7 h-7 text-blue-400" />
            <span>Usuarios y Permisos del Sistema</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Gestión de cuentas y roles de acceso (Administradores y Personal Almacenero).
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl flex items-center space-x-2 shadow-lg shadow-blue-900/30 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Crear Nuevo Usuario</span>
        </button>
      </div>

      {/* Tabla de Usuarios */}
      <div className="bg-[#0b1226] rounded-3xl border border-slate-800 shadow-xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#070e22] text-slate-400 uppercase text-[10px] tracking-wider font-black border-b border-slate-800">
            <tr>
              <th className="px-5 py-4">Nombre Completo</th>
              <th className="px-4 py-4">Usuario (Login)</th>
              <th className="px-4 py-4 text-center">Rol Asignado</th>
              <th className="px-4 py-4 text-center">Estado</th>
              <th className="px-5 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                  Cargando usuarios...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                  No hay usuarios registrados.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isAdmin = u.rol === 'ADMINISTRADOR';
                const isActivo = u.estado === 'ACTIVO';
                const isCurrent = currentUser?.id === u.id;

                return (
                  <tr key={u.id} className="hover:bg-slate-900/40 transition">
                    <td className="px-5 py-3.5 font-bold text-white flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300">
                        {isAdmin ? <ShieldCheck className="w-4 h-4 text-sky-400" /> : <UserIcon className="w-4 h-4 text-emerald-400" />}
                      </div>
                      <div>
                        <span>{u.nombre}</span>
                        {isCurrent && (
                          <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-500/30">
                            Tú
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 font-mono font-bold text-purple-400">
                      @{u.usuario}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          isAdmin ? 'bg-sky-950/80 text-sky-400 border border-sky-500/30' : 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {u.rol}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          isActivo ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950/80 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {u.estado}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-right whitespace-nowrap space-x-2">
                      <button
                        onClick={() => setResetUserId(u.id)}
                        className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition font-medium cursor-pointer"
                      >
                        Cambiar Clave
                      </button>
                      <button
                        onClick={() => handleToggleStatus(u)}
                        disabled={isCurrent}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          isActivo
                            ? 'text-amber-400 border-amber-500/30 bg-amber-950/40 hover:bg-amber-950'
                            : 'text-emerald-400 border-emerald-500/30 bg-emerald-950/40 hover:bg-emerald-950'
                        }`}
                      >
                        {isActivo ? 'Desactivar' : 'Activar'}
                      </button>
                      {!isCurrent && (
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="p-1.5 text-rose-400 hover:text-white bg-rose-950/40 hover:bg-rose-900 border border-rose-500/30 rounded-lg transition cursor-pointer"
                          title="Eliminar usuario permanentemente"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Nuevo Usuario */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-[#0b1226] text-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-800">
            <div className="flex items-center justify-between px-6 py-4 bg-[#070e22] border-b border-slate-800">
              <h3 className="font-bold text-base text-white">Registrar Nuevo Usuario</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-950/60 border border-red-500/40 text-red-300 rounded-xl text-xs font-medium flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Martín Gómez"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 text-white rounded-xl focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Nombre de Usuario (Login) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. mgomez"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value.toLowerCase().replace(/\s/g, ''))}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 text-white rounded-xl focus:border-blue-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Correo electrónico (opcional)
                </label>
                <input
                  type="email"
                  placeholder="Ej. mgomez@empresa.com — recibirá un enlace para definir su contraseña"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 text-white rounded-xl focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Contraseña Inicial *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 6 caracteres"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 text-white rounded-xl focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Rol en Almacén *
                </label>
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value as UserRole)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 text-white rounded-xl focus:border-blue-500 outline-none font-medium"
                >
                  <option value="ALMACENERO">ALMACENERO (Consultas, escaneo, ingresos y despachos)</option>
                  <option value="ADMINISTRADOR">ADMINISTRADOR (Acceso total, ajustes, usuarios)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-900/30 transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Guardando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reset Password */}
      {resetUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-[#0b1226] text-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-800">
            <div className="px-6 py-4 bg-[#070e22] border-b border-slate-800 text-white flex justify-between items-center">
              <h3 className="font-bold text-sm text-white">Restablecer Contraseña</h3>
              <button
                onClick={() => setResetUserId(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1 uppercase">
                  Nueva Contraseña *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 text-white rounded-xl focus:border-blue-500 outline-none"
                />
              </div>
              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setResetUserId(null)}
                  className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow transition cursor-pointer"
                >
                  Actualizar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};