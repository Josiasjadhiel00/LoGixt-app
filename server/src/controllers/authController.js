import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/connection.js';
import { JWT_SECRET } from '../middleware/auth.js';
import { logActivity } from '../utils/activityLogger.js';

export function login(req, res) {
  const { usuario, contrasena } = req.body;

  if (!usuario || !contrasena) {
    return res.status(400).json({ error: 'Debe ingresar el usuario y la contraseña.' });
  }

  const user = db.prepare(`
    SELECT u.id, u.nombre, u.apellido, u.usuario, u.contrasena_hash, u.rol, u.estado, u.empresa_id,
           u.email, u.telefono, u.foto, u.tema, u.color_acento,
           u.almacenamiento_configurado, u.almacenamiento_modo,
           e.nombre AS empresa_nombre, e.estado AS empresa_estado,
           s.estado AS suscripcion_estado, p.nombre AS plan_nombre
    FROM usuarios u
    LEFT JOIN empresas e ON u.empresa_id = e.id
    LEFT JOIN suscripciones s ON (e.id = s.empresa_id)
    LEFT JOIN planes p ON (s.plan_id = p.id OR e.plan_id = p.id)
    WHERE LOWER(u.usuario) = LOWER(?)
    ORDER BY s.id DESC LIMIT 1
  `).get(usuario.trim());

  if (!user) {
    return res.status(401).json({ error: 'Credenciales inválidas. Verifique su usuario y contraseña.' });
  }

  if (user.estado !== 'ACTIVO') {
    return res.status(403).json({ error: 'Usuario inactivo. Comuníquese con el administrador del almacén.' });
  }

  const isPasswordValid = bcrypt.compareSync(contrasena, user.contrasena_hash);
  if (!isPasswordValid) {
    return res.status(401).json({ error: 'Credenciales inválidas. Verifique su usuario y contraseña.' });
  }

  // Generar token JWT con validez de 24 horas
  const token = jwt.sign(
    { id: user.id, usuario: user.usuario, rol: user.rol, empresa_id: user.empresa_id },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return res.json({
    message: 'Inicio de sesión exitoso.',
    token,
    user: {
      id: user.id,
      nombre: user.nombre,
      apellido: user.apellido || null,
      usuario: user.usuario,
      email: user.email || null,
      telefono: user.telefono || null,
      foto: user.foto || null,
      tema: user.tema || 'logixt',
      color_acento: user.color_acento || 'purple',
      almacenamiento_configurado: Boolean(user.almacenamiento_configurado),
      almacenamiento_modo: user.almacenamiento_modo || 'LOCAL_SYNC',
      rol: user.rol,
      estado: user.estado,
      empresa_id: user.empresa_id,
      empresa_nombre: user.empresa_nombre || (user.rol === 'SUPERADMIN' ? 'Plataforma Global' : null),
      empresa_estado: user.empresa_estado || null,
      suscripcion_estado: user.suscripcion_estado || null,
      plan_nombre: user.plan_nombre || null
    }
  });
}

export function getProfile(req, res) {
  const user = db.prepare(`
    SELECT u.id, u.nombre, u.apellido, u.usuario, u.rol, u.estado, u.empresa_id,
           u.email, u.telefono, u.foto, u.tema, u.color_acento,
           u.almacenamiento_configurado, u.almacenamiento_modo,
           e.nombre AS empresa_nombre, e.estado AS empresa_estado,
           s.estado AS suscripcion_estado, p.nombre AS plan_nombre
    FROM usuarios u
    LEFT JOIN empresas e ON u.empresa_id = e.id
    LEFT JOIN suscripciones s ON (e.id = s.empresa_id)
    LEFT JOIN planes p ON (s.plan_id = p.id OR e.plan_id = p.id)
    WHERE u.id = ?
    ORDER BY s.id DESC LIMIT 1
  `).get(req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  return res.json({
    user: {
      id: user.id,
      nombre: user.nombre,
      apellido: user.apellido || null,
      usuario: user.usuario,
      email: user.email || null,
      telefono: user.telefono || null,
      foto: user.foto || null,
      tema: user.tema || 'logixt',
      color_acento: user.color_acento || 'purple',
      almacenamiento_configurado: Boolean(user.almacenamiento_configurado),
      almacenamiento_modo: user.almacenamiento_modo || 'LOCAL_SYNC',
      rol: user.rol,
      estado: user.estado,
      empresa_id: user.empresa_id,
      empresa_nombre: user.empresa_nombre || (user.rol === 'SUPERADMIN' ? 'Plataforma Global' : null),
      empresa_estado: user.empresa_estado || null,
      suscripcion_estado: user.suscripcion_estado || null,
      plan_nombre: user.plan_nombre || null
    }
  });
}

export function updateProfile(req, res) {
  const { nombre, apellido, email, telefono, foto } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }

  try {
    db.prepare(`
      UPDATE usuarios SET
        nombre = ?,
        apellido = ?,
        email = ?,
        telefono = ?,
        foto = ?
      WHERE id = ?
    `).run(
      nombre.trim(),
      apellido ? apellido.trim() : null,
      email ? email.trim() : null,
      telefono ? telefono.trim() : null,
      foto ? foto.trim() : null,
      req.user.id
    );

    const updated = db.prepare(`
      SELECT u.id, u.nombre, u.apellido, u.usuario, u.rol, u.estado, u.empresa_id,
             u.email, u.telefono, u.foto, u.tema, u.color_acento,
             e.nombre AS empresa_nombre
      FROM usuarios u
      LEFT JOIN empresas e ON u.empresa_id = e.id
      WHERE u.id = ?
    `).get(req.user.id);

    logActivity({
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      empresa_id: req.user.empresa_id,
      accion: 'PERFIL_ACTUALIZADO',
      detalles: `El usuario ${updated.usuario} actualizó sus datos de perfil.`,
      ip_origen: req.ip
    });

    return res.json({
      message: 'Perfil actualizado exitosamente.',
      user: updated
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al actualizar el perfil.',
      ...(process.env.NODE_ENV !== 'production' ? { details: error.message } : {})
    });
  }
}

export function updatePreferences(req, res) {
  const { tema, color_acento } = req.body;

  try {
    db.prepare(`
      UPDATE usuarios SET
        tema = COALESCE(?, tema),
        color_acento = COALESCE(?, color_acento)
      WHERE id = ?
    `).run(
      tema || null,
      color_acento || null,
      req.user.id
    );

    const updated = db.prepare(`
      SELECT 
        u.id, u.nombre, u.apellido, u.usuario, u.rol, u.estado, u.email, u.telefono, u.foto,
        u.tema, u.color_acento, u.empresa_id
      FROM usuarios u
      WHERE u.id = ?
    `).get(req.user.id);

    logActivity({
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      empresa_id: req.user.empresa_id,
      accion: 'PREFERENCIAS_ACTUALIZADAS',
      detalles: `El usuario ${req.user.usuario} actualizó sus preferencias (Tema: ${updated.tema}, Color: ${updated.color_acento}).`,
      ip_origen: req.ip
    });

    return res.json({
      message: 'Preferencias guardadas exitosamente.',
      tema: updated.tema,
      color_acento: updated.color_acento,
      user: updated
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al guardar preferencias de apariencia.' });
  }
}

export function changePassword(req, res) {
  const { contrasena_actual, contrasena_nueva } = req.body;

  if (!contrasena_actual || !contrasena_nueva) {
    return res.status(400).json({ error: 'Se requiere la contraseña actual y la nueva contraseña.' });
  }

  if (contrasena_nueva.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  const user = db.prepare('SELECT contrasena_hash, usuario FROM usuarios WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(contrasena_actual, user.contrasena_hash)) {
    return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
  }

  const salt = bcrypt.genSaltSync(10);
  const newHash = bcrypt.hashSync(contrasena_nueva, salt);

  db.prepare('UPDATE usuarios SET contrasena_hash = ? WHERE id = ?').run(newHash, req.user.id);

  logActivity({
    usuario_id: req.user.id,
    usuario_nombre: req.user.nombre,
    empresa_id: req.user.empresa_id,
    accion: 'CONTRASENA_CAMBIADA',
    detalles: `El usuario ${user.usuario} modificó su contraseña.`,
    ip_origen: req.ip
  });

  return res.json({ message: 'Contraseña actualizada exitosamente.' });
}
