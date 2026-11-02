import jwt from 'jsonwebtoken';
import db from '../db/connection.js';

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

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado. Token no suministrado.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(`
      SELECT u.id, u.nombre, u.usuario, u.rol, u.estado, u.empresa_id,
             e.nombre AS empresa_nombre, e.estado AS empresa_estado
      FROM usuarios u
      LEFT JOIN empresas e ON u.empresa_id = e.id
      WHERE u.id = ?
    `).get(decoded.id);

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
