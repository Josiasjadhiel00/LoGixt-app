import db, { transaction } from '../db/connection.js';

/**
 * 📥 Procesador de eventos de Webhook de pasarelas de pago
 */
export function handleWebhook(req, res) {
  const event = req.body;

  if (!event || !event.type) {
    return res.status(400).json({ error: 'Payload de webhook inválido: falta campo "type".' });
  }

  const { type, data } = event;
  const payloadStr = JSON.stringify(event);

  try {
    let logError = null;
    let processedMessage = '';

    transaction((db) => {
      // 1. Identificar la empresa afectada por customer_id, subscription_id o empresa_id directo
      const customerId = data?.customer_id;
      const subscriptionId = data?.subscription_id;
      const directEmpresaId = data?.empresa_id;

      let sub = null;
      if (subscriptionId) {
        sub = db.prepare('SELECT s.*, e.nombre as empresa_nombre FROM suscripciones s JOIN empresas e ON s.empresa_id = e.id WHERE s.payment_subscription_id = ?').get(subscriptionId);
      }
      if (!sub && customerId) {
        sub = db.prepare('SELECT s.*, e.nombre as empresa_nombre FROM suscripciones s JOIN empresas e ON s.empresa_id = e.id WHERE s.payment_customer_id = ? ORDER BY s.id DESC LIMIT 1').get(customerId);
      }
      if (!sub && directEmpresaId) {
        sub = db.prepare('SELECT s.*, e.nombre as empresa_nombre FROM suscripciones s JOIN empresas e ON s.empresa_id = e.id WHERE s.empresa_id = ? ORDER BY s.id DESC LIMIT 1').get(directEmpresaId);
      }

      if (!sub) {
        logError = `No se encontró suscripción asociada para el evento ${type}`;
        return;
      }

      // 2. Procesar según tipo de evento
      switch (type) {
        case 'payment.succeeded':
        case 'invoice.payment_succeeded': {
          // Pago aprobado: Extender suscripción +30 días, marcar ACTIVE y reactivar empresa
          const monto = data?.amount || data?.monto || 79.00;
          const paymentId = data?.payment_id || `pay_wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + 30);
          const strNextDate = nextDate.toISOString().split('T')[0];

          db.prepare(`
            UPDATE suscripciones SET
              estado = 'ACTIVE',
              fecha_proximo_pago = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(strNextDate, sub.id);

          db.prepare(`
            UPDATE empresas SET
              estado = 'ACTIVA',
              fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(sub.empresa_id);

          db.prepare(`
            INSERT INTO pagos (empresa_id, suscripcion_id, monto, moneda, estado, payment_id, metodo_pago)
            VALUES (?, ?, ?, 'USD', 'PAGADO', ?, 'WEBHOOK PASARELA DE PAGOS')
          `).run(sub.empresa_id, sub.id, monto, paymentId);

          processedMessage = `Pago de $${monto} aprobado para ${sub.empresa_nombre}. Suscripción renovada hasta ${strNextDate}.`;
          break;
        }

        case 'payment.failed':
        case 'invoice.payment_failed': {
          // Pago rechazado: Marcar PAST_DUE
          db.prepare(`
            UPDATE suscripciones SET
              estado = 'PAST_DUE',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(sub.id);

          const monto = data?.amount || data?.monto || 0;
          const paymentId = data?.payment_id || `pay_fail_${Date.now()}`;

          db.prepare(`
            INSERT INTO pagos (empresa_id, suscripcion_id, monto, moneda, estado, payment_id, metodo_pago)
            VALUES (?, ?, ?, 'USD', 'FALLIDO', ?, 'WEBHOOK PASARELA DE PAGOS')
          `).run(sub.empresa_id, sub.id, monto, paymentId);

          processedMessage = `Pago fallido registrado para ${sub.empresa_nombre}. Estado cambiado a PAST_DUE.`;
          break;
        }

        case 'subscription.canceled': {
          // Suscripción cancelada
          const hoy = new Date().toISOString().split('T')[0];
          db.prepare(`
            UPDATE suscripciones SET
              estado = 'CANCELED',
              fecha_cancelacion = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(hoy, sub.id);

          db.prepare(`
            UPDATE empresas SET
              estado = 'SUSPENDIDA',
              fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(sub.empresa_id);

          processedMessage = `Suscripción cancelada para ${sub.empresa_nombre}. Acceso suspendido sin eliminar datos.`;
          break;
        }

        case 'subscription.renewed': {
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + 30);
          const strNextDate = nextDate.toISOString().split('T')[0];

          db.prepare(`
            UPDATE suscripciones SET
              estado = 'ACTIVE',
              fecha_proximo_pago = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(strNextDate, sub.id);

          db.prepare(`
            UPDATE empresas SET
              estado = 'ACTIVA',
              fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(sub.empresa_id);

          processedMessage = `Suscripción renovada para ${sub.empresa_nombre}.`;
          break;
        }

        case 'payment.past_due': {
          db.prepare("UPDATE suscripciones SET estado = 'PAST_DUE', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(sub.id);
          processedMessage = `Suscripción marcada como PAST_DUE para ${sub.empresa_nombre}.`;
          break;
        }

        default:
          logError = `Evento desconocido: ${type}`;
          break;
      }
    });

    // 3. Registrar auditoría inmutable en webhook_logs
    db.prepare(`
      INSERT INTO webhook_logs (evento, proveedor, payload, procesado, error)
      VALUES (?, 'GATEWAY_PAGOS', ?, ?, ?)
    `).run(type, payloadStr, logError ? 0 : 1, logError);

    if (logError) {
      return res.status(400).json({ status: 'warning', message: logError });
    }

    return res.json({ status: 'success', message: processedMessage || 'Webhook procesado con éxito.' });
  } catch (error) {
    console.error('Error procesando webhook:', error);
    try {
      db.prepare(`
        INSERT INTO webhook_logs (evento, proveedor, payload, procesado, error)
        VALUES (?, 'GATEWAY_PAGOS', ?, 0, ?)
      `).run(type, payloadStr, error.message);
    } catch {}

    return res.status(500).json({ error: 'Error procesando webhook.', details: error.message });
  }
}

/**
 * ⚡ Simular evento de webhook directamente (para pruebas o demostración)
 */
export function simulateWebhook(req, res) {
  const { type, empresa_id, amount } = req.body;

  if (!type || !empresa_id) {
    return res.status(400).json({ error: 'Se requiere "type" y "empresa_id".' });
  }

  // Despachar hacia handleWebhook internamente
  req.body = {
    type,
    data: {
      empresa_id: Number(empresa_id),
      amount: amount || 79.00,
      payment_id: `pay_sim_${Date.now()}`
    }
  };

  return handleWebhook(req, res);
}
