import db from '../db/connection.js';
import { getFirebaseAdminAuth } from './firebaseAdmin.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Devuelve el correo en minúsculas y sin espacios, o null si no es válido.
 */
export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

/**
 * Servicio para crear la identidad de Firebase Authentication de un usuario de LOGIXT
 * y enviarle el correo para definir su contraseña.
 *
 * Las dependencias se inyectan para poder probarlo sin Firebase real.
 */
export function createFirebaseUserService({
  database = db,
  getAuth = getFirebaseAdminAuth,
  fetchFn = globalThis.fetch,
  env = process.env
} = {}) {
  function emailInUse(email, excludeUserId = null) {
    const normalized = normalizeEmail(email);
    if (!normalized) return false;
    const row = database.prepare(`
      SELECT id FROM usuarios
      WHERE LOWER(TRIM(email)) = ? AND id != ?
      LIMIT 1
    `).get(normalized, excludeUserId ?? -1);
    return Boolean(row);
  }

  /**
   * Firebase envía el correo de "definir contraseña" (PASSWORD_RESET). Al completarlo,
   * el usuario también demuestra que el correo es suyo. El Admin SDK no envía correos,
   * por eso se usa la API REST con la clave web pública del proyecto.
   */
  async function sendPasswordSetupEmail(email) {
    const apiKey = env.FIREBASE_WEB_API_KEY;
    if (!apiKey) {
      return { sent: false, reason: 'Falta FIREBASE_WEB_API_KEY en el servidor.' };
    }

    const headers = { 'Content-Type': 'application/json' };
    // Si la clave web tiene restricción por referer, Firebase necesita ver el dominio del cliente.
    if (env.CLIENT_URL) headers.Referer = `${env.CLIENT_URL.replace(/\/+$/, '')}/`;

    try {
      const response = await fetchFn(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
          signal: AbortSignal.timeout(10000)
        }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const code = body?.error?.message || `HTTP ${response.status}`;
        console.error('Firebase no pudo enviar el correo de configuración:', code);
        return { sent: false, reason: code };
      }
      return { sent: true };
    } catch (error) {
      console.error('Error de red al enviar el correo de Firebase:', error.message);
      return { sent: false, reason: 'No se pudo contactar con Firebase.' };
    }
  }

  /**
   * Crea (o vincula) la cuenta de Firebase para un usuario local y le envía el correo.
   * Nunca lanza: el alta local no debe fallar por un problema de Firebase.
   *
   * @returns {{status: 'created'|'linked'|'skipped'|'error', emailSent: boolean, message: string}}
   */
  async function provision({ userId, email, displayName }) {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      return { status: 'skipped', emailSent: false, message: 'El correo no es válido.' };
    }

    let auth;
    try {
      auth = getAuth();
    } catch (error) {
      console.error('Firebase Admin mal configurado:', error.message);
      return {
        status: 'skipped',
        emailSent: false,
        message: 'Firebase está mal configurado en el servidor; la cuenta se guardó solo en LOGIXT.'
      };
    }
    if (!auth) {
      return {
        status: 'skipped',
        emailSent: false,
        message: 'Firebase no está configurado en el servidor; la cuenta se guardó solo en LOGIXT.'
      };
    }

    try {
      let firebaseUser;
      let created = false;
      try {
        firebaseUser = await auth.getUserByEmail(normalized);
      } catch (error) {
        if (error?.code !== 'auth/user-not-found') throw error;
        firebaseUser = await auth.createUser({
          email: normalized,
          displayName: displayName || undefined,
          emailVerified: false
        });
        created = true;
      }

      // Una identidad de Firebase solo puede pertenecer a un usuario de LOGIXT.
      const owner = database.prepare('SELECT id FROM usuarios WHERE firebase_uid = ?').get(firebaseUser.uid);
      if (owner && owner.id !== userId) {
        return {
          status: 'skipped',
          emailSent: false,
          message: 'Ese correo ya está vinculado a otro usuario de LOGIXT.'
        };
      }
      if (!owner) {
        database.prepare(`
          UPDATE usuarios SET firebase_uid = ? WHERE id = ? AND firebase_uid IS NULL
        `).run(firebaseUser.uid, userId);
      }

      const hasLoginMethod = Array.isArray(firebaseUser.providerData) && firebaseUser.providerData.length > 0;
      if (!created && hasLoginMethod) {
        return {
          status: 'linked',
          emailSent: false,
          message: 'Se vinculó con la cuenta de Firebase que ya existía para ese correo.'
        };
      }

      const mail = await sendPasswordSetupEmail(normalized);
      if (mail.sent) {
        return {
          status: 'created',
          emailSent: true,
          message: `Se creó el acceso con correo y se envió un enlace a ${normalized} para definir la contraseña (revisa también spam).`
        };
      }
      return {
        status: 'created',
        emailSent: false,
        message: 'Se creó el acceso con correo, pero no se pudo enviar el mensaje. ' +
          'La persona puede usar "¿Olvidaste tu contraseña?" en el inicio de sesión.'
      };
    } catch (error) {
      console.error('No se pudo crear la identidad de Firebase:', error?.code || '', error?.message || error);
      return {
        status: 'error',
        emailSent: false,
        message: 'No se pudo crear el acceso con correo en Firebase; la cuenta se guardó en LOGIXT.'
      };
    }
  }

  return { emailInUse, provision, sendPasswordSetupEmail };
}

const defaultService = createFirebaseUserService();

export const emailInUse = defaultService.emailInUse;
export const provisionFirebaseIdentity = defaultService.provision;
