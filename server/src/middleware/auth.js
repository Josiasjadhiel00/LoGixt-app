import jwt from 'jsonwebtoken';
import db from '../db/connection.js';
import { getFirebaseAdminAuth } from '../services/firebaseAdmin.js';

const isProd = process.env.NODE_ENV === 'production';

const insecureSecrets = [
  'CAMBIAR_ESTE_SECRETO_POR_UNO_SEGURO_EN_PRODUCCION',
  'CAMBIAR_EN_PRODUCCION',
  'example_jwt_secret',
  'secret'
];

if (isProd && (!process.env.JWT_SECRET || insecureSecrets.includes(process.env.JWT_SECRET))) {
  console.error('\n❌ ERROR CRÍTICO DE SEGURIDAD: process.env.JWT_SECRET no está configurado de forma segura en entorno de producción.');
  console.error('Configure una clave criptográfica segura en sus variables de entorno antes de iniciar el servidor.');
  process.exit(1);
}

export const JWT_SECRET = process.env.JWT_SECRET || 'wms_dev_fallback_secret_key_2026';

const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || 'logixt-59b8c';

function getLocalUserById(id) {
  return db.prepare(`
    SELECT u.id, u.nombre, u.usuario, u.rol, u.estado, u.empresa_id, u.firebase_uid, u.email,
           e.nombre AS empresa_nombre, e.estado AS empresa_estado
    FROM usuarios u
    LEFT JOIN empresas e ON u.empresa_id = e.id
    WHERE u.id = ?
  `).get(id);
}

function resolveFirebaseUser(firebaseUser) {
  let user = db.prepare(`
    SELECT id, firebase_uid FROM usuarios WHERE firebase_uid = ?
  `).get(firebaseUser.uid);

  if (!user) {
    const matches = db.prepare(`
      SELECT id, firebase_uid
      FROM usuarios
      WHERE LOWER(TRIM(email)) = LOWER(?)
    `).all(firebaseUser.email.trim());

    if (matches.length !== 1) {
      return {
        error: matches.length
          ? 'El correo está asociado a varias cuentas. Contacte al SuperAdmin para resolver la vinculación.'
          : 'No existe una cuenta de LOGIXT vinculada a este correo. Contacte al administrador de su empresa.',
        status: matches.length ? 409 : 403
      };
    }

    user = matches[0];
    if (user.firebase_uid && user.firebase_uid !== firebaseUser.uid) {
      return {
        error: 'Esta cuenta ya está vinculada a otra identidad de Firebase.',
        status: 409
      };
    }

    if (!user.firebase_uid) {
      db.prepare(`
        UPDATE usuarios SET firebase_uid = ?
        WHERE id = ? AND firebase_uid IS NULL
      `).run(firebaseUser.uid, user.id);
    }
  }

  const localUser = getLocalUserById(user.id);
  if (!localUser || localUser.firebase_uid !== firebaseUser.uid) {
    return {
      error: 'No se pudo completar de forma segura la vinculación de la cuenta.',
      status: 409
    };
  }

  return { user: localUser };
}

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado. Token no suministrado.' });
  }

  const token = authHeader.split(' ')[1];
  const unverifiedClaims = jwt.decode(token);

  if (
    unverifiedClaims &&
    typeof unverifiedClaims === 'object' &&
    unverifiedClaims.iss === `https://securetoken.google.com/${firebaseProjectId}`
  ) {
    let firebaseAuth;
    try {
      firebaseAuth = getFirebaseAdminAuth();
    } catch (error) {
      console.error('Configuración de Firebase Admin inválida:', error.message);
      return res.status(503).json({ error: 'La autenticación Firebase no está configurada correctamente.' });
    }

    if (!firebaseAuth) {
      return res.status(503).json({ error: 'La autenticación Firebase no está configurada en el servidor.' });
    }

    let firebaseUser;
    try {
      firebaseUser = await firebaseAuth.verifyIdToken(token, true);
    } catch {
      return res.status(401).json({ error: 'Token de Firebase inválido o expirado.' });
    }

    if (!firebaseUser.email || firebaseUser.email_verified !== true) {
      return res.status(403).json({ error: 'Verifique su correo electrónico antes de acceder a LOGIXT.' });
    }

    try {
      const result = resolveFirebaseUser(firebaseUser);
      if (result.error) {
        return res.status(result.status).json({ error: result.error });
      }

      if (result.user.estado !== 'ACTIVO') {
        return res.status(403).json({ error: 'Cuenta de usuario inactiva. Contacte al administrador.' });
      }

      req.user = result.user;
      req.authProvider = 'firebase';
      req.firebaseUid = firebaseUser.uid;
      return next();
    } catch (error) {
      console.error('Error vinculando identidad Firebase con usuario LOGIXT:', error);
      return res.status(500).json({ error: 'No se pudo validar la cuenta vinculada.' });
    }
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = getLocalUserById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado.' });
    }

    if (user.estado !== 'ACTIVO') {
      return res.status(403).json({ error: 'Cuenta de usuario inactiva. Contacte al administrador.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Token inválido o expirado.',
      ...(process.env.NODE_ENV !== 'production' ? { details: err.message } : {})
    });
  }
}
