import db from '../db/connection.js';

/**
 * 💳 Consultar la suscripción de la empresa del usuario actual ("Mi Suscripción")
 */
export function getMySubscription(req, res) {
  const empresaId = req.user.empresa_id;

  if (!empresaId && req.user.rol === 'SUPERADMIN') {
    return res.json({
      isSuperAdmin: true,
      message: 'Eres el Propietario de la Plataforma (SuperAdmin).'
    });
  }

  if (!empresaId) {
    return res.status(403).json({ error: 'Usuario no asignado a ninguna empresa.' });
  }

  try {
    const tenant = db.prepare(`
      SELECT 
        e.id AS empresa_id, e.nombre AS empresa_nombre, e.email AS empresa_email,
        e.estado AS empresa_estado, e.telefono, e.logo,
        s.id AS suscripcion_id, s.estado AS suscripcion_estado,
        s.fecha_inicio, s.fecha_proximo_pago, s.fecha_cancelacion,
        p.id AS plan_id, p.codigo AS plan_codigo, p.nombre AS plan_nombre,
        p.precio AS plan_precio, p.periodo AS plan_periodo,
        p.max_usuarios, p.max_almacenes, p.caracteristicas
      FROM empresas e
      LEFT JOIN suscripciones s ON e.id = s.empresa_id
      LEFT JOIN planes p ON (s.plan_id = p.id OR e.plan_id = p.id)
      WHERE e.id = ?
      ORDER BY s.id DESC LIMIT 1
    `).get(empresaId);

    if (!tenant) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }

    // Período de gracia
    const confGracia = db.prepare("SELECT valor FROM configuracion_saas WHERE clave = 'dias_periodo_gracia'").get();
    const diasGracia = confGracia ? parseInt(confGracia.valor, 10) : 5;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    let diasVencido = 0;
    let diasGraciaRestantes = diasGracia;

    if (tenant.fecha_proximo_pago) {
      const fechaPago = new Date(tenant.fecha_proximo_pago + 'T00:00:00');
      const diffTime = hoy.getTime() - fechaPago.getTime();
      diasVencido = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      diasGraciaRestantes = Math.max(0, diasGracia - Math.max(0, diasVencido));
    }

    // Historial de pagos
    const payments = db.prepare(`
      SELECT id, monto, moneda, estado, payment_id, metodo_pago, fecha_pago, comprobante_url
      FROM pagos
      WHERE empresa_id = ?
      ORDER BY fecha_pago DESC
    `).all(empresaId);

    // Contadores actuales de uso
    const totalUsuarios = db.prepare("SELECT COUNT(*) as count FROM usuarios WHERE empresa_id = ? AND estado = 'ACTIVO'").get(empresaId).count;
    const totalProductos = db.prepare('SELECT COUNT(*) as count FROM productos WHERE empresa_id = ?').get(empresaId).count;

    return res.json({
      subscription: {
        ...tenant,
        caracteristicas: tenant.caracteristicas ? JSON.parse(tenant.caracteristicas) : [],
        dias_gracia: diasGracia,
        dias_vencido: diasVencido,
        dias_gracia_restantes: diasGraciaRestantes,
        en_periodo_gracia: diasVencido > 0 && diasVencido <= diasGracia,
        uso: {
          usuarios_activos: totalUsuarios,
          max_usuarios: tenant.max_usuarios,
          total_productos: totalProductos,
          max_almacenes: tenant.max_almacenes
        }
      },
      payments
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al consultar datos de suscripción.', details: error.message });
  }
}
