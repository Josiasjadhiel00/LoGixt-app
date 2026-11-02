import db, { transaction } from '../db/connection.js';
import { logActivity } from '../utils/activityLogger.js';

/**
 * 📱 Listar los dispositivos pertenecientes a la empresa del usuario
 */
export function getMyDevices(req, res) {
  const empresaId = req.user.empresa_id;

  if (!empresaId) {
    return res.status(403).json({ error: 'Usuario no asignado a ninguna empresa.' });
  }

  try {
    const dispositivos = db.prepare(`
      SELECT 
        d.id, d.uuid, d.nombre, d.tipo, d.sistema_operativo, d.version_logixt,
        d.estado, d.fecha_activacion, d.ultima_conexion, d.fecha_registro,
        d.codigo_activacion, d.codigo_expiracion
      FROM dispositivos d
      WHERE d.empresa_id = ?
      ORDER BY d.fecha_registro DESC
    `).all(empresaId);

    // Consultar límite según el plan de la empresa
    const planInfo = db.prepare(`
      SELECT p.max_dispositivos, p.nombre as plan_nombre
      FROM empresas e
      JOIN planes p ON e.plan_id = p.id
      WHERE e.id = ?
    `).get(empresaId);

    const maxDispositivos = planInfo ? planInfo.max_dispositivos : 1;
    const activosCount = dispositivos.filter(d => d.estado === 'ACTIVO').length;

    return res.json({
      dispositivos,
      max_dispositivos: maxDispositivos,
      activos_count: activosCount,
      limite_alcanzado: activosCount >= maxDispositivos,
      plan_nombre: planInfo?.plan_nombre || 'Básico'
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al consultar dispositivos de la empresa.', details: error.message });
  }
}

/**
 * 🔑 Activar y vincular dispositivo mediante código de activación temporal (LGX-XXXX-XXXX)
 */
export function activateDeviceWithCode(req, res) {
  const empresaId = req.user.empresa_id;
  const { codigo, nombre, tipo, sistema_operativo, version_logixt } = req.body;

  if (!codigo || !codigo.trim()) {
    return res.status(400).json({ error: 'Debe ingresar el código de activación.' });
  }

  if (!empresaId) {
    return res.status(403).json({ error: 'Usuario no asignado a ninguna empresa.' });
  }

  const cleanCode = codigo.trim().toUpperCase();

  try {
    // 1. Buscar dispositivo con el código
    const dispositivo = db.prepare('SELECT * FROM dispositivos WHERE codigo_activacion = ?').get(cleanCode);

    if (!dispositivo) {
      return res.status(404).json({ error: 'Código de activación inválido o inexistente.' });
    }

    // 2. Verificar que el código pertenezca a la empresa del usuario
    if (dispositivo.empresa_id !== empresaId) {
      return res.status(403).json({ error: 'Este código de activación no corresponde a su empresa.' });
    }

    // 3. Verificar expiración
    if (dispositivo.codigo_expiracion) {
      const expDate = new Date(dispositivo.codigo_expiracion);
      if (new Date() > expDate) {
        return res.status(400).json({ error: 'El código de activación ha expirado. Solicite un nuevo código al SuperAdmin.' });
      }
    }

    // 4. Verificar límite de dispositivos según el plan de la empresa
    const planInfo = db.prepare(`
      SELECT p.max_dispositivos
      FROM empresas e
      JOIN planes p ON e.plan_id = p.id
      WHERE e.id = ?
    `).get(empresaId);

    const maxDispositivos = planInfo ? planInfo.max_dispositivos : 1;
    const activosCount = db.prepare("SELECT COUNT(*) as count FROM dispositivos WHERE empresa_id = ? AND estado = 'ACTIVO'").get(empresaId).count;

    if (activosCount >= maxDispositivos) {
      return res.status(400).json({
        error: 'Has alcanzado el límite de dispositivos de tu plan.',
        max_dispositivos: maxDispositivos,
        activos_count: activosCount
      });
    }

    // 5. Vincular y activar el dispositivo (consumo de código de un solo uso)
    const nowIso = new Date().toISOString();
    const resolvedNombre = nombre && nombre.trim() ? nombre.trim() : dispositivo.nombre;

    function normalizeDeviceType(t) {
      if (!t) return 'PC';
      const clean = t.toString().trim().toLowerCase();
      if (clean === 'tablet') return 'Tablet';
      if (clean === 'pc') return 'PC';
      if (clean === 'laptop') return 'Laptop';
      return 'Otro';
    }

    const resolvedTipo = normalizeDeviceType(tipo || dispositivo.tipo);
    const resolvedSO = sistema_operativo || dispositivo.sistema_operativo || 'N/A';
    const resolvedVer = version_logixt || dispositivo.version_logixt || 'v1.0.4';

    db.prepare(`
      UPDATE dispositivos SET
        nombre = ?,
        tipo = ?,
        sistema_operativo = ?,
        version_logixt = ?,
        estado = 'ACTIVO',
        codigo_activacion = NULL,
        codigo_expiracion = NULL,
        fecha_activacion = ?,
        ultima_conexion = ?
      WHERE id = ?
    `).run(resolvedNombre, resolvedTipo, resolvedSO, resolvedVer, nowIso, nowIso, dispositivo.id);

    const updated = db.prepare('SELECT * FROM dispositivos WHERE id = ?').get(dispositivo.id);

    // Registrar en auditoría
    logActivity({
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      empresa_id: empresaId,
      accion: 'DISPOSITIVO_ACTIVADO',
      detalles: `Dispositivo "${updated.nombre}" (${updated.tipo}) activado exitosamente mediante código.`,
      ip_origen: req.ip
    });

    return res.json({
      message: `Dispositivo "${updated.nombre}" activado y vinculado exitosamente a Logixt.`,
      dispositivo: updated
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al procesar la activación del dispositivo.', details: error.message });
  }
}

/**
 * 💓 Heartbeat / Ping de dispositivo para mantener actualizada su última conexión
 */
export function pingDevice(req, res) {
  const { id } = req.params;
  const empresaId = req.user.empresa_id;

  try {
    const dispositivo = db.prepare('SELECT * FROM dispositivos WHERE id = ?').get(id);
    if (!dispositivo) {
      return res.status(404).json({ error: 'Dispositivo no encontrado.' });
    }

    if (req.user.rol !== 'SUPERADMIN' && dispositivo.empresa_id !== empresaId) {
      return res.status(403).json({ error: 'No autorizado para este dispositivo.' });
    }

    db.prepare('UPDATE dispositivos SET ultima_conexion = CURRENT_TIMESTAMP WHERE id = ?').run(id);

    return res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Error al registrar conexión del dispositivo.' });
  }
}
