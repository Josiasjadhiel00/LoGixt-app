import db from '../db/connection.js';

/**
 * 📝 Registra un evento en el log inmutable de auditoría y actividad
 */
export function logActivity({
  usuario_id,
  usuario_nombre,
  empresa_id,
  empresa_nombre,
  accion,
  detalles,
  ip_origen
}) {
  try {
    let resolvedEmpresaNombre = empresa_nombre;
    let resolvedUsuarioNombre = usuario_nombre;

    if (!resolvedEmpresaNombre && empresa_id) {
      const emp = db.prepare('SELECT nombre FROM empresas WHERE id = ?').get(empresa_id);
      if (emp) resolvedEmpresaNombre = emp.nombre;
    }

    if (!resolvedUsuarioNombre && usuario_id) {
      const u = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(usuario_id);
      if (u) resolvedUsuarioNombre = u.nombre;
    }

    const detailsStr = typeof detalles === 'object' ? JSON.stringify(detalles) : (detalles || null);

    db.prepare(`
      INSERT INTO actividad_logs (
        usuario_id, usuario_nombre, empresa_id, empresa_nombre, accion, detalles, ip_origen
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      usuario_id || null,
      resolvedUsuarioNombre || 'Sistema',
      empresa_id || null,
      resolvedEmpresaNombre || null,
      accion,
      detailsStr,
      ip_origen || null
    );
  } catch (error) {
    console.error('Error al registrar actividad en auditoría:', error.message);
  }
}
