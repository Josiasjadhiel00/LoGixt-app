import bcrypt from 'bcryptjs';
import db, { transaction } from '../db/connection.js';
import { emailInUse, normalizeEmail, provisionFirebaseIdentity } from '../services/firebaseUsers.js';

export function getAllUsers(req, res) {
  const isSuper = req.user.rol === 'SUPERADMIN';
  let empresaId = null;

  if (isSuper) {
    if (req.query.empresa_id) {
      empresaId = Number(req.query.empresa_id);
    }
  } else {
    empresaId = req.user.empresa_id;
    if (!empresaId) {
      return res.status(403).json({ error: 'Acceso denegado: Usuario sin empresa asociada.' });
    }
  }

  try {
    const whereClause = empresaId ? 'WHERE empresa_id = ?' : 'WHERE 1=1';
    const params = empresaId ? [empresaId] : [];

    const users = db.prepare(`
      SELECT id, nombre, usuario, rol, estado, empresa_id, fecha_creacion
      FROM usuarios
      ${whereClause}
      ORDER BY id ASC
    `).all(...params);

    return res.json({ users });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al listar usuarios.',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
}

export async function createUser(req, res) {
  const { nombre, usuario, contrasena, rol } = req.body;
  const rawEmail = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  const isSuper = req.user.rol === 'SUPERADMIN';
  const empresaId = isSuper && req.body.empresa_id
    ? Number(req.body.empresa_id)
    : req.user.empresa_id;

  if (!isSuper && !empresaId) {
    return res.status(403).json({ error: 'Acceso denegado: Usuario sin empresa asociada.' });
  }

  if (!nombre || !usuario || !contrasena || !rol) {
    return res.status(400).json({ error: 'Todos los campos (nombre, usuario, contraseña, rol) son obligatorios.' });
  }

  if (!['ADMINISTRADOR', 'ALMACENERO'].includes(rol)) {
    return res.status(400).json({ error: 'El rol debe ser ADMINISTRADOR o ALMACENERO.' });
  }

  if (contrasena.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres.' });
  }

  if (rawEmail && !email) {
    return res.status(400).json({ error: 'El correo electrónico no es válido.' });
  }

  try {
    // 1. Validar límite de usuarios según el plan si no es SUPERADMIN
    if (empresaId && req.user.rol !== 'SUPERADMIN') {
      const empresaInfo = db.prepare(`
        SELECT p.max_usuarios, COUNT(u.id) as total_usuarios
        FROM empresas e
        LEFT JOIN planes p ON e.plan_id = p.id
        LEFT JOIN usuarios u ON u.empresa_id = e.id AND u.estado = 'ACTIVO'
        WHERE e.id = ?
        GROUP BY e.id
      `).get(empresaId);

      if (empresaInfo && empresaInfo.max_usuarios && empresaInfo.total_usuarios >= empresaInfo.max_usuarios) {
        return res.status(400).json({
          error: `Ha alcanzado el límite máximo de usuarios permitidos (${empresaInfo.max_usuarios}) en su plan actual. Para añadir más usuarios, actualice su plan en "Mi Suscripción".`
        });
      }
    }

    const existing = db.prepare('SELECT id FROM usuarios WHERE LOWER(usuario) = LOWER(?)').get(usuario.trim());
    if (existing) {
      return res.status(400).json({ error: `El nombre de usuario "${usuario.trim()}" ya está en uso en la plataforma.` });
    }

    if (email && emailInUse(email)) {
      return res.status(400).json({ error: `El correo "${email}" ya está registrado en otra cuenta.` });
    }

    const salt = bcrypt.genSaltSync(10);
    const passHash = bcrypt.hashSync(contrasena, salt);

    const result = db.prepare(`
      INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol, estado, empresa_id, email)
      VALUES (?, ?, ?, ?, 'ACTIVO', ?, ?)
    `).run(nombre.trim(), usuario.trim(), passHash, rol, empresaId, email);

    const newUser = db.prepare('SELECT id, nombre, usuario, rol, estado, empresa_id, email, fecha_creacion FROM usuarios WHERE id = ?').get(result.lastInsertRowid);

    // Con correo: se crea la cuenta de Firebase y se envía el enlace para definir la contraseña.
    const firebase = email
      ? await provisionFirebaseIdentity({ userId: Number(result.lastInsertRowid), email, displayName: nombre.trim() })
      : null;

    return res.status(201).json({
      message: firebase ? `Usuario creado exitosamente. ${firebase.message}` : 'Usuario creado exitosamente.',
      user: newUser,
      firebase
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al registrar usuario.',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
}

export function toggleUserStatus(req, res) {
  const { id } = req.params;
  const isSuper = req.user.rol === 'SUPERADMIN';
  const empresaId = isSuper ? null : req.user.empresa_id;

  if (!isSuper && !empresaId) {
    return res.status(403).json({ error: 'Acceso denegado: Usuario sin empresa asociada.' });
  }

  if (Number(id) === req.user.id) {
    return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta de usuario en sesión.' });
  }

  try {
    let query = 'SELECT id, estado, rol, nombre, empresa_id FROM usuarios WHERE id = ?';
    const params = [id];
    if (empresaId) {
      query += ' AND empresa_id = ?';
      params.push(empresaId);
    }

    const user = db.prepare(query).get(...params);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado en su empresa.' });
    }

    const nuevoEstado = user.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    db.prepare('UPDATE usuarios SET estado = ? WHERE id = ?').run(nuevoEstado, id);

    return res.json({
      message: `El usuario "${user.nombre}" ahora está ${nuevoEstado}.`,
      nuevoEstado
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al cambiar el estado del usuario.',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
}

export function resetPassword(req, res) {
  const { id } = req.params;
  const nueva_contrasena = req.body.nueva_contrasena || req.body.contrasena;
  const isSuper = req.user.rol === 'SUPERADMIN';
  const empresaId = isSuper ? null : req.user.empresa_id;

  if (!isSuper && !empresaId) {
    return res.status(403).json({ error: 'Acceso denegado: Usuario sin empresa asociada.' });
  }

  if (!nueva_contrasena || nueva_contrasena.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    let query = 'SELECT id, nombre, empresa_id FROM usuarios WHERE id = ?';
    const params = [id];
    if (empresaId) {
      query += ' AND empresa_id = ?';
      params.push(empresaId);
    }

    const user = db.prepare(query).get(...params);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado en su empresa.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passHash = bcrypt.hashSync(nueva_contrasena, salt);

    db.prepare('UPDATE usuarios SET contrasena_hash = ? WHERE id = ?').run(passHash, id);

    return res.json({ message: `Contraseña restablecida exitosamente para el usuario "${user.nombre}".` });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al restablecer la contraseña.',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
}

export function deleteUser(req, res) {
  const { id } = req.params;
  const targetId = Number(id);

  if (!targetId) {
    return res.status(400).json({ error: 'ID de usuario inválido.' });
  }

  if (req.user.id === targetId) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de usuario en sesión.' });
  }

  const isSuper = req.user.rol === 'SUPERADMIN';
  const empresaId = isSuper ? null : req.user.empresa_id;

  try {
    let query = 'SELECT id, nombre, usuario, rol, empresa_id FROM usuarios WHERE id = ?';
    const params = [targetId];
    if (empresaId) {
      query += ' AND empresa_id = ?';
      params.push(empresaId);
    }

    const targetUser = db.prepare(query).get(...params);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuario no encontrado o no pertenece a su empresa.' });
    }

    if (targetUser.rol === 'SUPERADMIN') {
      return res.status(403).json({ error: 'No se puede eliminar un usuario con rol SuperAdmin.' });
    }

    transaction((dbTx) => {
      // Reasignar movimientos para preservar histórico sin error de foreign key
      dbTx.prepare('UPDATE movimientos SET usuario_id = ? WHERE usuario_id = ?').run(req.user.id, targetId);

      // Limpiar configuraciones locales si existen
      dbTx.prepare('DELETE FROM configuracion_almacenamiento WHERE usuario_id = ?').run(targetId);
      dbTx.prepare('DELETE FROM sincronizacion_logs WHERE usuario_id = ?').run(targetId);

      // Eliminar usuario
      dbTx.prepare('DELETE FROM usuarios WHERE id = ?').run(targetId);
    });

    return res.json({
      ok: true,
      message: `Usuario "${targetUser.nombre}" (@${targetUser.usuario}) eliminado exitosamente.`
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al eliminar el usuario.',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
}
