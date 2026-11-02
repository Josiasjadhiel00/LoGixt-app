import db from '../db/connection.js';

/**
 * Middleware para validar aislamiento multi-tenant y estado de suscripción de la empresa
 */
export function checkTenantAccess(req, res, next) {
  // 1. Si no hay usuario autenticado (debe pasar por authenticate primero)
  if (!req.user) {
    return res.status(401).json({ error: 'Acceso no autenticado.' });
  }

  // 2. Si el rol es SUPERADMIN de plataforma, tiene acceso irrestricto
  if (req.user.rol === 'SUPERADMIN') {
    req.tenant = { isSuperAdmin: true, empresa_id: null, empresa_nombre: 'Plataforma Global' };
    return next();
  }

  // 3. Usuario de empresa debe tener empresa_id
  const empresaId = req.user.empresa_id;
  if (!empresaId) {
    return res.status(403).json({
      error: 'Usuario sin empresa asignada.',
      code: 'NO_TENANT'
    });
  }

  try {
    // 4. Obtener información de la empresa, plan y última suscripción
    const tenant = db.prepare(`
      SELECT 
        e.id AS empresa_id, e.nombre AS empresa_nombre, e.email AS empresa_email,
        e.estado AS empresa_estado, e.plan_id, e.telefono, e.logo,
        s.id AS suscripcion_id, s.estado AS suscripcion_estado,
        s.fecha_inicio, s.fecha_proximo_pago, s.payment_customer_id, s.payment_subscription_id,
        p.codigo AS plan_codigo, p.nombre AS plan_nombre, p.precio AS plan_precio,
        p.max_usuarios, p.max_almacenes, p.caracteristicas
      FROM empresas e
      LEFT JOIN suscripciones s ON e.id = s.empresa_id
      LEFT JOIN planes p ON (s.plan_id = p.id OR e.plan_id = p.id)
      WHERE e.id = ?
      ORDER BY s.id DESC LIMIT 1
    `).get(empresaId);

    if (!tenant) {
      return res.status(404).json({
        error: 'Empresa no encontrada en el sistema.',
        code: 'TENANT_NOT_FOUND'
      });
    }

    // 5. Obtener período de gracia configurado (en días)
    const confGracia = db.prepare("SELECT valor FROM configuracion_saas WHERE clave = 'dias_periodo_gracia'").get();
    const diasGracia = confGracia ? parseInt(confGracia.valor, 10) : 5;

    // 6. Evaluación de fechas y estado de suscripción
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

    // 7. Transición automática según vigencia y período de gracia
    if (diasVencido > 0) {
      if (diasVencido <= diasGracia) {
        // En período de gracia: estado PAST_DUE
        if (tenant.suscripcion_estado === 'ACTIVE' || tenant.suscripcion_estado === 'TRIALING') {
          db.prepare("UPDATE suscripciones SET estado = 'PAST_DUE', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(tenant.suscripcion_id);
          tenant.suscripcion_estado = 'PAST_DUE';
        }
      } else {
        // Superó los días de gracia: suspensión automática
        if (tenant.suscripcion_estado !== 'SUSPENDED' || tenant.empresa_estado !== 'SUSPENDIDA') {
          db.prepare("UPDATE suscripciones SET estado = 'SUSPENDED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(tenant.suscripcion_id);
          db.prepare("UPDATE empresas SET estado = 'SUSPENDIDA', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?").run(tenant.empresa_id);
          tenant.suscripcion_estado = 'SUSPENDED';
          tenant.empresa_estado = 'SUSPENDIDA';
        }
      }
    }

    // 8. Permitir rutas de consulta/pago de suscripción incluso si está suspendida
    const isSubscriptionRoute = req.originalUrl.includes('/api/subscriptions/my-subscription') ||
                                req.originalUrl.includes('/api/subscriptions/simulate-payment') ||
                                req.originalUrl.includes('/api/auth/me') ||
                                req.originalUrl.includes('/api/auth/change-password');

    // 9. Si la empresa o suscripción está suspendida o inactiva y no es ruta de suscripción
    const isSuspended = tenant.empresa_estado === 'SUSPENDIDA' ||
                        tenant.empresa_estado === 'INACTIVA' ||
                        tenant.suscripcion_estado === 'SUSPENDED' ||
                        tenant.suscripcion_estado === 'CANCELED';

    if (isSuspended && !isSubscriptionRoute) {
      return res.status(403).json({
        error: 'Suscripción suspendida',
        code: 'TENANT_SUSPENDED',
        message: 'Tu suscripción no está activa actualmente. Contacta al administrador para renovar el servicio.',
        tenant: {
          empresa_id: tenant.empresa_id,
          empresa_nombre: tenant.empresa_nombre,
          empresa_estado: tenant.empresa_estado,
          suscripcion_estado: tenant.suscripcion_estado,
          fecha_proximo_pago: tenant.fecha_proximo_pago,
          plan_nombre: tenant.plan_nombre
        }
      });
    }

    // 10. Inyectar objeto tenant enriquecido en la petición
    req.tenant = {
      ...tenant,
      diasGracia,
      diasVencido,
      diasGraciaRestantes,
      enPeriodoGracia: diasVencido > 0 && diasVencido <= diasGracia
    };

    next();
  } catch (err) {
    console.error('Error en middleware checkTenantAccess:', err);
    return res.status(500).json({ error: 'Error interno verificando suscripción de la empresa.' });
  }
}
