import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { api, ApiError } from '../services/api';
import { isNetworkUnavailable } from '../services/localStorageDb';
import { offlineDataRepository } from '../repositories/offlineDataRepository';
import {
  firebaseAuth,
  FIREBASE_SESSION_TOKEN,
  signOutFirebase
} from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (usuario: string, contrasena: string) => Promise<void>;
  logout: () => void;
  updateUser: (updated: Partial<User>) => void;
  isAdmin: boolean;
  isAlmacenero: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Tiempo máximo que se espera la validación de la sesión guardada antes de mostrar la interfaz.
const SESSION_CHECK_MAX_WAIT_MS = 6000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('wms_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!firebaseAuth) return;

    return onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      setIsLoading(true);
      setToken(firebaseUser ? FIREBASE_SESSION_TOKEN : localStorage.getItem('wms_token'));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let releaseTimer: number | undefined;

    const initAuth = async () => {
      if (token) {
        // Si el servidor tarda en responder (p. ej. Render despertando), no dejamos la app
        // en la pantalla de carga: tras unos segundos se muestra la interfaz y, cuando
        // /auth/me responda, la sesión se completa o se descarta sola.
        releaseTimer = window.setTimeout(() => {
          if (!cancelled) setIsLoading(false);
        }, SESSION_CHECK_MAX_WAIT_MS);

        let cachedUser: User | null = null;

        try {
          cachedUser = await offlineDataRepository.getUser();
          if (cachedUser) {
            offlineDataRepository.setActiveUser(cachedUser);
            setUser(cachedUser);
          }
        } catch (error) {
          console.error('No se pudo recuperar el usuario guardado para modo offline:', error);
        }

        try {
          const res = await api.auth.me();
          if (cancelled) return;
          setUser(res.user);
          try {
            await offlineDataRepository.saveUser(res.user);
            await offlineDataRepository.saveResponse('/auth/me', res);
          } catch (error) {
            console.error('No se pudo guardar la sesión para uso offline:', error);
          }
        } catch (error) {
          const isInvalidToken = error instanceof ApiError &&
            (error.status === 401 || error.status === 403);

          if (!isInvalidToken && !isNetworkUnavailable(error) && !(error instanceof ApiError && error.status === 0)) {
            console.error('No se pudo validar la sesión guardada:', error);
          }

          if (isInvalidToken) {
            localStorage.removeItem('wms_token');
            void signOutFirebase().catch((error) => {
              console.error('No se pudo cerrar la sesión de Firebase inválida:', error);
            });
            setToken(null);
            offlineDataRepository.setActiveUser(null);
            setUser(null);
            if (cachedUser) {
              try {
                await offlineDataRepository.clearUser(cachedUser.id);
              } catch (cleanupError) {
                console.error('No se pudo limpiar una sesión local inválida:', cleanupError);
              }
            }
          } else if (!cachedUser) {
            offlineDataRepository.setActiveUser(null);
            setUser(null);
          }
        }
      }

      window.clearTimeout(releaseTimer);
      if (!cancelled) setIsLoading(false);
    };

    initAuth();

    return () => {
      cancelled = true;
      window.clearTimeout(releaseTimer);
    };
  }, [token]);

  const login = async (usuario: string, contrasena: string) => {
    if (firebaseAuth && usuario.includes('@')) {
      localStorage.removeItem('wms_token');
    }
    const res = await api.auth.login(usuario, contrasena);
    if (res.token === FIREBASE_SESSION_TOKEN) {
      localStorage.removeItem('wms_token');
    } else {
      localStorage.setItem('wms_token', res.token);
    }
    setToken(res.token);
    setUser(res.user);
    try {
      await offlineDataRepository.saveUser(res.user);
      await offlineDataRepository.saveResponse('/auth/me', { user: res.user });
    } catch (error) {
      console.error('No se pudo guardar la sesión para uso offline:', error);
    }
  };

  const logout = () => {
    const userId = user?.id;
    localStorage.removeItem('wms_token');
    void signOutFirebase().catch((error) => {
      console.error('No se pudo cerrar la sesión de Firebase:', error);
    });
    setToken(null);
    setUser(null);
    offlineDataRepository.setActiveUser(null);
    if (userId) {
      void offlineDataRepository.clearUser(userId).catch((error) => {
        console.error('No se pudo limpiar los datos locales al cerrar sesión:', error);
      });
    }
  };

  const updateUser = (updated: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...updated };
      void offlineDataRepository.saveUser(next).catch((error) => {
        console.error('No se pudo actualizar el perfil local para modo offline:', error);
      });
      void offlineDataRepository.saveResponse('/auth/me', { user: next }).catch((error) => {
        console.error('No se pudo actualizar el perfil guardado para modo offline:', error);
      });
      return next;
    });
  };

  const isAdmin = user?.rol === 'ADMINISTRADOR';
  const isAlmacenero = user?.rol === 'ALMACENERO';

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, updateUser, isAdmin, isAlmacenero }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
