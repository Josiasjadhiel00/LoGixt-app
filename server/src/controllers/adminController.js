import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db, { transaction } from '../db/connection.js';
import { logActivity } from '../utils/activityLogger.js';
import { emailInUse, normalizeEmail, provisionFirebaseIdentity } from '../services/firebaseUsers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 📊 KPIs globales y analíticas de la plataforma para el Dashboard de SuperAdmin
 */
export function getPlatformMetrics(req, res) {
  try {
    const totalEmpresas = db.prepare('SELECT COUNT(*) as count FROM empresas').get().count;
    const empresasActivas = db.prepare("SELECT COUNT(*) as count FROM empresas WHERE estado = 'ACTIVA'").get().count;
    const empresasSuspendidas = db.prepare("SELECT COUNT(*) as count FROM empresas WHERE estado = 'SUSPENDIDA'").get().count;
    const empresasInactivas = db.prepare("SELECT COUNT(*) as count FROM empresas WHERE estado = 'INACTIVA'").get().count;

    // Empresas en mora o período de gracia
    const suscripcionesPastDue = db.prepare("SELECT COUNT(*) as count FROM suscripciones WHERE estado = 'PAST_DUE'").get().count;
    const suscripcionesActivas = db.prepare("SELECT COUNT(*) as count FROM suscripciones WHERE estado = 'ACTIVE'").get().count;

    // Pagos pendientes
    const pagosPendientes = db.prepare("SELECT COUNT(*) as count FROM pagos WHERE estado = 'PENDIENTE' OR estado = 'FALLIDO'").get().count;

    // Ingresos mensuales recurrentes estimados (MRR)
    const mrrResult = db.prepare(`
      SELECT COALESCE(SUM(p.precio), 0) as mrr
      FROM empresas e
      JOIN planes p ON e.plan_id = p.id
      WHERE e.estado = 'ACTIVA'
    `).get();
    const mrr = mrrResult ? mrrResult.mrr : 0;

    // Próximos vencimientos (dentro de los próximos 7 días)
    const hoy = new Date();
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() + 7);

    const strHoy = hoy.toISOString().split('T')[0];
    const strLimite = fechaLimite.toISOString().split('T')[0];

    const proximasAVencer = db.prepare(`
      SELECT COUNT(*) as count
      FROM suscripciones s
      JOIN empresas e ON s.empresa_id = e.id
      WHERE s.fecha_proximo_pago BETWEEN ? AND ? AND s.estado IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
    `).get(strHoy, strLimite).count;

    // Totales de volumen operativo y usuarios
    const totalUsuarios = db.prepare("SELECT COUNT(*) as count FROM usuarios WHERE rol != 'SUPERADMIN'").get().count;
    const totalProductos = db.prepare('SELECT COUNT(*) as count FROM productos').get().count;
    const totalMovimientos = db.prepare('SELECT COUNT(*) as count FROM movimientos').get().count;

    // Dispositivos
    const totalDispositivos = db.prepare('SELECT COUNT(*) as count FROM dispositivos').get().count;
    const dispositivosActivos = db.prepare("SELECT COUNT(*) as count FROM dispositivos WHERE estado = 'ACTIVO'").get().count;
    const dispositivosPendientes = db.prepare("SELECT COUNT(*) as count FROM dispositivos WHERE estado = 'PENDIENTE'").get().count;
    const dispositivosBloqueados = db.prepare("SELECT COUNT(*) as count FROM dispositivos WHERE estado = 'BLOQUEADO'").get().count;
    const tabletsCount = db.prepare("SELECT COUNT(*) as count FROM dispositivos WHERE tipo = 'Tablet'").get().count;
    const pcsCount = db.prepare("SELECT COUNT(*) as count FROM dispositivos WHERE tipo = 'PC'").get().count;
    const laptopsCount = db.prepare("SELECT COUNT(*) as count FROM dispositivos WHERE tipo = 'Laptop'").get().count;
    const otrosDispositivosCount = db.prepare("SELECT COUNT(*) as count FROM dispositivos WHERE tipo = 'Otro'").get().count;

    // Configuración actual
    const confGracia = db.prepare("SELECT valor FROM configuracion_saas WHERE clave = 'dias_periodo_gracia'").get();
    const diasGracia = confGracia ? parseInt(confGracia.valor, 10) : 5;

    // 📈 DATOS REALES PARA LOS 4 GRÁFICOS:
    // 1. Ingresos Mensuales (historial real de pagos pagados)
    const ingresosRows = db.prepare(`
      SELECT 
        strftime('%Y-%m', fecha_pago) as mes,
        COALESCE(SUM(monto), 0) as total
      FROM pagos
      WHERE estado = 'PAGADO'
      GROUP BY strftime('%Y-%m', fecha_pago)
      ORDER BY mes ASC
    `).all();

    const mesesLabels = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      mesesLabels.push(`${yyyy}-${mm}`);
    }

    const ingresosMensuales = mesesLabels.map((mesKey) => {
      const found = ingresosRows.find((r) => r.mes === mesKey);
      const [year, month] = mesKey.split('-');
      const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      const label = dateObj.toLocaleDateString('es-ES', { month: 'short' }).toUpperCase();
      return {
        mes: mesKey,
        label,
        total: found ? found.total : (mesKey === mesesLabels[mesesLabels.length - 1] ? mrr : 0)
      };
    });

    // 2. Estado de Suscripciones (Activas, Pendientes, Suspendidas, etc.)
    const suscripcionesRows = db.prepare(`
      SELECT estado, COUNT(*) as count
      FROM suscripciones
      GROUP BY estado
    `).all();

    // 3. Distribución de Dispositivos (Tablets, PCs, Laptops, Otros)
    const distribucionDispositivos = [
      { tipo: 'Tablets', count: tabletsCount, color: '#8b5cf6' },
      { tipo: 'PCs', count: pcsCount, color: '#3b82f6' },
      { tipo: 'Laptops', count: laptopsCount, color: '#06b6d4' },
      { tipo: 'Otros', count: otrosDispositivosCount, color: '#64748b' }
    ];

    // 4. Crecimiento Mensual de Empresas Registradas
    const crecimientoRows = db.prepare(`
      SELECT strftime('%Y-%m', fecha_creacion) as mes, COUNT(*) as count
      FROM empresas
      GROUP BY strftime('%Y-%m', fecha_creacion)
      ORDER BY mes ASC
    `).all();

    const crecimientoEmpresas = mesesLabels.map((mesKey) => {
      const found = crecimientoRows.find((r) => r.mes === mesKey);
      const [year, month] = mesKey.split('-');
      const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      const label = dateObj.toLocaleDateString('es-ES', { month: 'short' }).toUpperCase();
      return {
        mes: mesKey,
        label,
        nuevas: found ? found.count : (mesKey === mesesLabels[mesesLabels.length - 1] ? totalEmpresas : 0)
      };
    });

    return res.json({
      metrics: {
        total_empresas: totalEmpresas,
        empresas_activas: empresasActivas,
        empresas_suspendidas: empresasSuspendidas,
        empresas_inactivas: empresasInactivas,
        suscripciones_activas: suscripcionesActivas,
        pagos_pendientes: pagosPendientes,
        empresas_past_due: suscripcionesPastDue,
        mrr,
        proximas_a_vencer: proximasAVencer,
        total_usuarios: totalUsuarios,
        total_productos: totalProductos,
        total_movimientos: totalMovimientos,
        dias_periodo_gracia: diasGracia,
        // Dispositivos
        total_dispositivos: totalDispositivos,
        dispositivos_activos: dispositivosActivos,
        dispositivos_pendientes: dispositivosPendientes,
        dispositivos_bloqueados: dispositivosBloqueados,
        tablets_count: tabletsCount,
        pcs_count: pcsCount,
        laptops_count: laptopsCount,
        otros_count: otrosDispositivosCount
      },
      charts: {
        ingresos_mensuales: ingresosMensuales,
        distribucion_suscripciones: suscripcionesRows,
        distribucion_dispositivos: distribucionDispositivos,
        crecimiento_empresas: crecimientoEmpresas,
        // Aliases
        monthly_revenue: ingresosMensuales,
        subscription_distribution: suscripcionesRows,
        device_breakdown: distribucionDispositivos,
        company_growth: crecimientoEmpresas
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al calcular métricas de la plataforma.', details: error.message });
  }
}

/**
 * 🏢 Listado de todas las empresas registradas
 */
export function getAllEmpresas(req, res) {
  const { search, estado, plan_id } = req.query;

  try {
    let query = `
      SELECT 
        e.id, e.nombre, e.email, e.telefono, e.logo, e.estado, e.plan_id, e.fecha_creacion,
        p.codigo AS plan_codigo, p.nombre AS plan_nombre, p.precio AS plan_precio,
        s.id AS suscripcion_id, s.estado AS suscripcion_estado, s.fecha_inicio, s.fecha_proximo_pago,
        (SELECT COUNT(*) FROM usuarios u WHERE u.empresa_id = e.id) AS total_usuarios,
        (SELECT COUNT(*) FROM productos pr WHERE pr.empresa_id = e.id) AS total_productos,
        (SELECT COUNT(*) FROM movimientos mv WHERE mv.empresa_id = e.id) AS total_movimientos
      FROM empresas e
      LEFT JOIN planes p ON e.plan_id = p.id
      LEFT JOIN suscripciones s ON (e.id = s.empresa_id)
      WHERE 1=1
    `;
    const params = [];

    if (search && search.trim()) {
      query += ' AND (e.nombre LIKE ? OR e.email LIKE ? OR e.telefono LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (estado && estado.trim()) {
      query += ' AND e.estado = ?';
      params.push(estado.trim());
    }

    if (plan_id) {
      query += ' AND e.plan_id = ?';
      params.push(Number(plan_id));
    }

    query += ' GROUP BY e.id ORDER BY e.id DESC';

    const empresas = db.prepare(query).all(...params);
    return res.json({ empresas });
  } catch (error) {
    return res.status(500).json({ error: 'Error al listar empresas.', details: error.message });
  }
}

/**
 * ➕ Crear nueva empresa con plan y usuario administrador
 */
export async function createEmpresa(req, res) {
  const {
    nombre,
    email,
    telefono,
    plan_id,
    admin_nombre,
    admin_usuario,
    admin_contrasena
  } = req.body;
  const rawAdminEmail = typeof req.body.admin_email === 'string' ? req.body.admin_email.trim() : '';
  const adminEmail = rawAdminEmail ? normalizeEmail(rawAdminEmail) : null;

  if (!nombre || !email || !plan_id || !admin_usuario || !admin_contrasena) {
    return res.status(400).json({
      error: 'Nombre de empresa, email, plan, usuario admin y contraseña son obligatorios.'
    });
  }

  if (rawAdminEmail && !adminEmail) {
    return res.status(400).json({ error: 'El correo del administrador no es válido.' });
  }

  try {
    // Validar email y usuario únicos
    const existingEmpresa = db.prepare('SELECT id FROM empresas WHERE LOWER(email) = LOWER(?)').get(email.trim());
    if (existingEmpresa) {
      return res.status(400).json({ error: `Ya existe una empresa registrada con el email "${email.trim()}".` });
    }

    const existingUser = db.prepare('SELECT id FROM usuarios WHERE LOWER(usuario) = LOWER(?)').get(admin_usuario.trim());
    if (existingUser) {
      return res.status(400).json({ error: `El nombre de usuario "${admin_usuario.trim()}" ya está en uso.` });
    }

    if (adminEmail && emailInUse(adminEmail)) {
      return res.status(400).json({ error: `El correo "${adminEmail}" ya está registrado en otra cuenta.` });
    }

    const plan = db.prepare('SELECT * FROM planes WHERE id = ?').get(plan_id);
    if (!plan) {
      return res.status(400).json({ error: 'El plan seleccionado no es válido.' });
    }

    const result = transaction((db) => {
      // 1. Crear empresa
      const empRes = db.prepare(`
        INSERT INTO empresas (nombre, email, telefono, estado, plan_id)
        VALUES (?, ?, ?, 'ACTIVA', ?)
      `).run(nombre.trim(), email.trim(), telefono ? telefono.trim() : null, plan.id);

      const empresaId = Number(empRes.lastInsertRowid);

      // 2. Crear usuario administrador de la empresa
      const salt = bcrypt.genSaltSync(10);
      const passHash = bcrypt.hashSync(admin_contrasena, salt);

      const adminRes = db.prepare(`
        INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol, estado, empresa_id, email)
        VALUES (?, ?, ?, 'ADMINISTRADOR', 'ACTIVO', ?, ?)
      `).run(admin_nombre ? admin_nombre.trim() : `Admin ${nombre.trim()}`, admin_usuario.trim(), passHash, empresaId, adminEmail);
      const adminId = Number(adminRes.lastInsertRowid);

      // 3. Crear suscripción activa con 30 días de vigencia
      const hoy = new Date();
      const proximoMes = new Date();
      proximoMes.setDate(proximoMes.getDate() + 30);

      const strHoy = hoy.toISOString().split('T')[0];
      const strProximo = proximoMes.toISOString().split('T')[0];

      const subRes = db.prepare(`
        INSERT INTO suscripciones (empresa_id, plan_id, estado, fecha_inicio, fecha_proximo_pago, payment_customer_id, payment_subscription_id)
        VALUES (?, ?, 'ACTIVE', ?, ?, ?, ?)
      `).run(
        empresaId,
        plan.id,
        strHoy,
        strProximo,
        `cus_live_${empresaId}_${Date.now()}`,
        `sub_live_${empresaId}_${Date.now()}`
      );

      // 4. Registrar primer pago simulado
      db.prepare(`
        INSERT INTO pagos (empresa_id, suscripcion_id, monto, moneda, estado, payment_id, metodo_pago)
        VALUES (?, ?, ?, 'USD', 'PAGADO', ?, 'ALTA MANUAL POR ADMINISTRADOR')
      `).run(empresaId, Number(subRes.lastInsertRowid), plan.precio, `pay_admin_init_${empresaId}_${Date.now()}`);

      return { empresaId, adminId };
    });

    const created = db.prepare(`
      SELECT e.*, p.nombre as plan_nombre
      FROM empresas e
      JOIN planes p ON e.plan_id = p.id
      WHERE e.id = ?
    `).get(result.empresaId);

    // Con correo del administrador: se crea su cuenta de Firebase y se le envía el enlace.
    const firebase = adminEmail
      ? await provisionFirebaseIdentity({
          userId: result.adminId,
          email: adminEmail,
          displayName: admin_nombre ? admin_nombre.trim() : `Admin ${nombre.trim()}`
        })
      : null;

    const baseMessage = `Empresa "${created.nombre}" dada de alta exitosamente con suscripción activa.`;
    return res.status(201).json({
      message: firebase ? `${baseMessage} ${firebase.message}` : baseMessage,
      empresa: created,
      firebase
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al registrar nueva empresa.', details: error.message });
  }
}

/**
 * ✏️ Actualizar datos de una empresa
 */
export function updateEmpresa(req, res) {
  const { id } = req.params;
  const { nombre, email, telefono, logo, estado } = req.body;

  try {
    const existing = db.prepare('SELECT * FROM empresas WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }

    db.prepare(`
      UPDATE empresas SET
        nombre = COALESCE(?, nombre),
        email = COALESCE(?, email),
        telefono = COALESCE(?, telefono),
        logo = COALESCE(?, logo),
        estado = COALESCE(?, estado),
        fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nombre ? nombre.trim() : null,
      email ? email.trim() : null,
      telefono ? telefono.trim() : null,
      logo ? logo.trim() : null,
      estado ? estado.trim() : null,
      id
    );

    const updated = db.prepare('SELECT * FROM empresas WHERE id = ?').get(id);
    return res.json({ message: 'Empresa actualizada correctamente.', empresa: updated });
  } catch (error) {
    return res.status(500).json({ error: 'Error al actualizar la empresa.', details: error.message });
  }
}

/**
 * 🔒 Suspender / Reactivar Empresa
 */
export function toggleEmpresaStatus(req, res) {
  const { id } = req.params;

  try {
    const empresa = db.prepare('SELECT id, nombre, estado FROM empresas WHERE id = ?').get(id);
    if (!empresa) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }

    const nuevoEstado = empresa.estado === 'ACTIVA' ? 'SUSPENDIDA' : 'ACTIVA';
    const subEstado = nuevoEstado === 'ACTIVA' ? 'ACTIVE' : 'SUSPENDED';

    transaction((db) => {
      db.prepare('UPDATE empresas SET estado = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?').run(nuevoEstado, id);
      db.prepare('UPDATE suscripciones SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE empresa_id = ?').run(subEstado, id);
    });

    return res.json({
      message: `Empresa "${empresa.nombre}" ahora está ${nuevoEstado}.`,
      nuevoEstado
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al cambiar estado de la empresa.', details: error.message });
  }
}

/**
 * ⚡ Cambiar Plan de una Empresa
 */
export function changeEmpresaPlan(req, res) {
  const { id } = req.params;
  const { plan_id } = req.body;

  if (!plan_id) {
    return res.status(400).json({ error: 'Debe especificar el nuevo plan_id.' });
  }

  try {
    const plan = db.prepare('SELECT * FROM planes WHERE id = ?').get(plan_id);
    if (!plan) {
      return res.status(404).json({ error: 'El plan especificado no existe.' });
    }

    transaction((db) => {
      db.prepare('UPDATE empresas SET plan_id = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?').run(plan.id, id);
      db.prepare('UPDATE suscripciones SET plan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE empresa_id = ?').run(plan.id, id);
    });

    return res.json({
      message: `Plan actualizado con éxito al "${plan.nombre}".`,
      plan
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al cambiar de plan.', details: error.message });
  }
}

/**
 * 📅 Extender suscripción manualmente
 */
export function extendSubscription(req, res) {
  const { id } = req.params;
  const { dias_adicionales, nueva_fecha } = req.body;

  try {
    const suscripcion = db.prepare('SELECT * FROM suscripciones WHERE empresa_id = ? ORDER BY id DESC LIMIT 1').get(id);
    if (!suscripcion) {
      return res.status(404).json({ error: 'Suscripción no encontrada para esta empresa.' });
    }

    let nextDateStr = '';
    if (nueva_fecha && nueva_fecha.trim()) {
      nextDateStr = nueva_fecha.trim();
    } else {
      const dias = dias_adicionales ? parseInt(dias_adicionales, 10) : 30;
      const baseDate = new Date(suscripcion.fecha_proximo_pago || Date.now());
      baseDate.setDate(baseDate.getDate() + dias);
      nextDateStr = baseDate.toISOString().split('T')[0];
    }

    transaction((db) => {
      // Actualizar fecha y asegurar estado ACTIVE
      db.prepare("UPDATE suscripciones SET fecha_proximo_pago = ?, estado = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(nextDateStr, suscripcion.id);
      db.prepare("UPDATE empresas SET estado = 'ACTIVA', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    });

    return res.json({
      message: `Suscripción extendida exitosamente hasta el ${nextDateStr}. Empresa reactivada.`,
      nueva_fecha: nextDateStr
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al extender suscripción.', details: error.message });
  }
}

/**
 * 👥 Obtener usuarios de una empresa específica
 */
export function getEmpresaUsers(req, res) {
  const { id } = req.params;

  try {
    const users = db.prepare(`
      SELECT id, nombre, usuario, rol, estado, fecha_creacion
      FROM usuarios
      WHERE empresa_id = ?
      ORDER BY id ASC
    `).all(id);

    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ error: 'Error al listar usuarios de la empresa.', details: error.message });
  }
}

/**
 * 💳 Obtener historial de pagos de una empresa
 */
export function getEmpresaPayments(req, res) {
  const { id } = req.params;

  try {
    const payments = db.prepare(`
      SELECT id, monto, moneda, estado, payment_id, metodo_pago, fecha_pago, comprobante_url
      FROM pagos
      WHERE empresa_id = ?
      ORDER BY fecha_pago DESC
    `).all(id);

    return res.json({ payments });
  } catch (error) {
    return res.status(500).json({ error: 'Error al consultar pagos de la empresa.', details: error.message });
  }
}

/**
 * 📦 Planes Comerciales
 */
export function getAllPlanes(req, res) {
  try {
    const planes = db.prepare('SELECT * FROM planes ORDER BY precio ASC').all();
    return res.json({ planes });
  } catch (error) {
    return res.status(500).json({ error: 'Error al consultar planes.', details: error.message });
  }
}

/**
 * ⚙️ Configuración Global SaaS
 */
export function getSaaSConfig(req, res) {
  try {
    const configRows = db.prepare('SELECT clave, valor FROM configuracion_saas').all();
    const config = {};
    configRows.forEach((r) => {
      config[r.clave] = r.valor;
    });
    return res.json({ config });
  } catch (error) {
    return res.status(500).json({ error: 'Error al obtener configuración.', details: error.message });
  }
}

export function updateSaaSConfig(req, res) {
  const { dias_periodo_gracia } = req.body;

  try {
    if (dias_periodo_gracia !== undefined) {
      const dias = Math.max(0, parseInt(dias_periodo_gracia, 10));
      db.prepare("INSERT OR REPLACE INTO configuracion_saas (clave, valor) VALUES ('dias_periodo_gracia', ?)").run(String(dias));
    }

    return res.json({ message: 'Configuración actualizada exitosamente.' });
  } catch (error) {
    return res.status(500).json({ error: 'Error al actualizar configuración.', details: error.message });
  }
}

/**
 * 📜 Registro de Webhooks
 */
export function getWebhookLogs(req, res) {
  try {
    const logs = db.prepare('SELECT * FROM webhook_logs ORDER BY id DESC LIMIT 50').all();
    return res.json({ logs });
  } catch (error) {
    return res.status(500).json({ error: 'Error al obtener logs de webhooks.', details: error.message });
  }
}

/**
 * 📱 Helper para generar código de activación temporal (LGX-XXXX-XXXX)
 */
function generateActivationCode() {
  const p1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const p2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `LGX-${p1}-${p2}`;
}

/**
 * 📱 DISPOSITIVOS: Listar todos los dispositivos globales con filtros y estadísticas
 */
export function getAllDevices(req, res) {
  const { search, empresa_id, estado, tipo } = req.query;

  try {
    let query = `
      SELECT 
        d.*,
        e.nombre AS empresa_nombre,
        p.codigo AS plan_codigo,
        p.nombre AS plan_nombre,
        p.max_dispositivos
      FROM dispositivos d
      JOIN empresas e ON d.empresa_id = e.id
      LEFT JOIN planes p ON e.plan_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (search && search.trim()) {
      query += ' AND (d.nombre LIKE ? OR d.uuid LIKE ? OR d.codigo_activacion LIKE ? OR e.nombre LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    if (empresa_id) {
      query += ' AND d.empresa_id = ?';
      params.push(Number(empresa_id));
    }

    if (estado && estado.trim()) {
      query += ' AND d.estado = ?';
      params.push(estado.trim());
    }

    if (tipo && tipo.trim()) {
      query += ' AND d.tipo = ?';
      params.push(tipo.trim());
    }

    query += ' ORDER BY d.fecha_registro DESC';

    const dispositivos = db.prepare(query).all(...params);

    // Métricas para las tarjetas superiores
    const total = db.prepare('SELECT COUNT(*) as count FROM dispositivos').get().count;
    const activos = db.prepare("SELECT COUNT(*) as count FROM dispositivos WHERE estado = 'ACTIVO'").get().count;
    const pendientes = db.prepare("SELECT COUNT(*) as count FROM dispositivos WHERE estado = 'PENDIENTE'").get().count;
    const bloqueados = db.prepare("SELECT COUNT(*) as count FROM dispositivos WHERE estado = 'BLOQUEADO'").get().count;
    const tablets = db.prepare("SELECT COUNT(*) as count FROM dispositivos WHERE tipo = 'Tablet'").get().count;
    const pcs = db.prepare("SELECT COUNT(*) as count FROM dispositivos WHERE tipo = 'PC'").get().count;

    return res.json({
      dispositivos,
      stats: {
        total,
        activos,
        pendientes,
        bloqueados,
        tablets,
        pcs
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al listar dispositivos globales.', details: error.message });
  }
}

/**
 * ➕ DISPOSITIVOS: Crear nuevo dispositivo para una empresa y generar código de activación
 */
export function createDevice(req, res) {
  const { empresa_id, nombre, tipo, sistema_operativo, version_logixt } = req.body;

  if (!empresa_id || !nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'La empresa y el nombre del dispositivo son obligatorios.' });
  }

  try {
    const empresa = db.prepare(`
      SELECT e.id, e.nombre, p.max_dispositivos, p.nombre as plan_nombre
      FROM empresas e
      LEFT JOIN planes p ON e.plan_id = p.id
      WHERE e.id = ?
    `).get(Number(empresa_id));

    if (!empresa) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }

    const maxDispositivos = empresa.max_dispositivos || 1;
    const currentActiveCount = db.prepare(`
      SELECT COUNT(*) as count FROM dispositivos 
      WHERE empresa_id = ? AND estado = 'ACTIVO'
    `).get(Number(empresa_id)).count;

    if (currentActiveCount >= maxDispositivos) {
      return res.status(400).json({
        error: 'Has alcanzado el límite de dispositivos de tu plan.',
        max_dispositivos: maxDispositivos,
        activos_count: currentActiveCount,
        plan_nombre: empresa.plan_nombre
      });
    }

    const uuid = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const codigoActivacion = generateActivationCode();

    // Expiración a las 48 horas
    const expDate = new Date();
    expDate.setHours(expDate.getHours() + 48);
    const expDateIso = expDate.toISOString();

    function normalizeDeviceType(t) {
      if (!t) return 'PC';
      const clean = t.toString().trim().toLowerCase();
      if (clean === 'tablet') return 'Tablet';
      if (clean === 'pc') return 'PC';
      if (clean === 'laptop') return 'Laptop';
      return 'Otro';
    }

    const insertResult = db.prepare(`
      INSERT INTO dispositivos (
        uuid, nombre, empresa_id, tipo, sistema_operativo, version_logixt,
        estado, codigo_activacion, codigo_expiracion, creado_por_usuario_id
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?)
    `).run(
      uuid,
      nombre.trim(),
      Number(empresa_id),
      normalizeDeviceType(tipo),
      sistema_operativo || 'N/A',
      version_logixt || 'v1.0.4',
      codigoActivacion,
      expDateIso,
      req.user.id
    );

    const created = db.prepare('SELECT * FROM dispositivos WHERE id = ?').get(insertResult.lastInsertRowid);

    // Auditoría
    logActivity({
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      empresa_id: Number(empresa_id),
      empresa_nombre: empresa.nombre,
      accion: 'DISPOSITIVO_CREADO',
      detalles: `Dispositivo "${created.nombre}" creado con código temporal ${codigoActivacion}.`,
      ip_origen: req.ip
    });

    return res.status(201).json({
      message: `Dispositivo creado con éxito. Código de activación: ${codigoActivacion}`,
      dispositivo: created,
      codigo_activacion: codigoActivacion,
      expira: expDateIso
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al registrar nuevo dispositivo.', details: error.message });
  }
}

/**
 * 🔑 DISPOSITIVOS: Generar nuevo código de activación temporal para un dispositivo
 */
export function generateDeviceCode(req, res) {
  const { id } = req.params;

  try {
    const dispositivo = db.prepare(`
      SELECT d.*, e.nombre as empresa_nombre 
      FROM dispositivos d
      JOIN empresas e ON d.empresa_id = e.id
      WHERE d.id = ?
    `).get(id);

    if (!dispositivo) {
      return res.status(404).json({ error: 'Dispositivo no encontrado.' });
    }

    const nuevoCodigo = generateActivationCode();
    const expDate = new Date();
    expDate.setHours(expDate.getHours() + 48);
    const expDateIso = expDate.toISOString();

    db.prepare(`
      UPDATE dispositivos SET
        codigo_activacion = ?,
        codigo_expiracion = ?,
        estado = 'PENDIENTE'
      WHERE id = ?
    `).run(nuevoCodigo, expDateIso, id);

    logActivity({
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      empresa_id: dispositivo.empresa_id,
      empresa_nombre: dispositivo.empresa_nombre,
      accion: 'CODIGO_DISPOSITIVO_GENERADO',
      detalles: `Nuevo código ${nuevoCodigo} generado para dispositivo "${dispositivo.nombre}".`,
      ip_origen: req.ip
    });

    const updated = db.prepare('SELECT * FROM dispositivos WHERE id = ?').get(id);

    return res.json({
      message: `Nuevo código generado: ${nuevoCodigo}`,
      dispositivo: updated,
      codigo_activacion: nuevoCodigo,
      expira: expDateIso
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al generar código para dispositivo.', details: error.message });
  }
}

/**
 * 🔒 DISPOSITIVOS: Cambiar estado (ACTIVO, BLOQUEADO, DESACTIVADO)
 */
export function toggleDeviceStatus(req, res) {
  const { id } = req.params;
  const { estado } = req.body;

  const validStates = ['ACTIVO', 'BLOQUEADO', 'DESACTIVADO', 'PENDIENTE'];
  if (!estado || !validStates.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Debe ser uno de: ${validStates.join(', ')}` });
  }

  try {
    const dispositivo = db.prepare(`
      SELECT d.*, e.nombre as empresa_nombre 
      FROM dispositivos d
      JOIN empresas e ON d.empresa_id = e.id
      WHERE d.id = ?
    `).get(id);

    if (!dispositivo) {
      return res.status(404).json({ error: 'Dispositivo no encontrado.' });
    }

    db.prepare('UPDATE dispositivos SET estado = ? WHERE id = ?').run(estado, id);

    let accion = 'DISPOSITIVO_ACTUALIZADO';
    if (estado === 'BLOQUEADO') accion = 'DISPOSITIVO_BLOQUEADO';
    else if (estado === 'DESACTIVADO') accion = 'DISPOSITIVO_DESACTIVADO';
    else if (estado === 'ACTIVO') accion = 'DISPOSITIVO_REACTIVADO';

    logActivity({
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      empresa_id: dispositivo.empresa_id,
      empresa_nombre: dispositivo.empresa_nombre,
      accion,
      detalles: `Dispositivo "${dispositivo.nombre}" cambió de estado a ${estado}.`,
      ip_origen: req.ip
    });

    return res.json({
      message: `Dispositivo "${dispositivo.nombre}" ahora está ${estado}.`,
      nuevoEstado: estado
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al cambiar estado del dispositivo.', details: error.message });
  }
}

/**
 * 🗑️ DISPOSITIVOS: Revocar / Eliminar dispositivo
 */
export function deleteDevice(req, res) {
  const { id } = req.params;

  try {
    const dispositivo = db.prepare(`
      SELECT d.*, e.nombre as empresa_nombre 
      FROM dispositivos d
      JOIN empresas e ON d.empresa_id = e.id
      WHERE d.id = ?
    `).get(id);

    if (!dispositivo) {
      return res.status(404).json({ error: 'Dispositivo no encontrado.' });
    }

    db.prepare('DELETE FROM dispositivos WHERE id = ?').run(id);

    logActivity({
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      empresa_id: dispositivo.empresa_id,
      empresa_nombre: dispositivo.empresa_nombre,
      accion: 'DISPOSITIVO_REVOCADO',
      detalles: `Dispositivo "${dispositivo.nombre}" (${dispositivo.uuid}) fue revocado permanentemente.`,
      ip_origen: req.ip
    });

    return res.json({ message: `Dispositivo "${dispositivo.nombre}" revocado exitosamente.` });
  } catch (error) {
    return res.status(500).json({ error: 'Error al revocar dispositivo.', details: error.message });
  }
}

/**
 * 📱 Obtener dispositivos de una empresa específica
 */
export function getEmpresaDevices(req, res) {
  const { id } = req.params;
  try {
    const dispositivos = db.prepare(`
      SELECT * FROM dispositivos WHERE empresa_id = ? ORDER BY fecha_registro DESC
    `).all(id);
    return res.json({ dispositivos });
  } catch (error) {
    return res.status(500).json({ error: 'Error al consultar dispositivos de la empresa.' });
  }
}

/**
 * 📋 Obtener actividad de auditoría de una empresa específica
 */
export function getEmpresaActivity(req, res) {
  const { id } = req.params;
  try {
    const activity = db.prepare(`
      SELECT * FROM actividad_logs WHERE empresa_id = ? ORDER BY id DESC LIMIT 50
    `).all(id);
    return res.json({ activity });
  } catch (error) {
    return res.status(500).json({ error: 'Error al consultar actividad de la empresa.' });
  }
}

/**
 * 📜 Registro Global de Actividad y Auditoría
 */
export function getGlobalActivityLogs(req, res) {
  const { empresa_id, accion, search } = req.query;

  try {
    let query = 'SELECT * FROM actividad_logs WHERE 1=1';
    const params = [];

    if (empresa_id) {
      query += ' AND empresa_id = ?';
      params.push(Number(empresa_id));
    }

    if (accion && accion.trim()) {
      query += ' AND accion = ?';
      params.push(accion.trim());
    }

    if (search && search.trim()) {
      query += ' AND (detalles LIKE ? OR usuario_nombre LIKE ? OR empresa_nombre LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY id DESC LIMIT 100';

    const logs = db.prepare(query).all(...params);
    return res.json({ logs });
  } catch (error) {
    return res.status(500).json({ error: 'Error al consultar auditoría de actividad.', details: error.message });
  }
}

/**
 * 💳 Listado Global de Todas las Suscripciones
 */
export function getAllSubscriptions(req, res) {
  try {
    const suscripciones = db.prepare(`
      SELECT 
        s.*,
        e.nombre AS empresa_nombre, e.email AS empresa_email, e.estado AS empresa_estado,
        p.codigo AS plan_codigo, p.nombre AS plan_nombre, p.precio AS plan_precio,
        p.max_dispositivos,
        (SELECT COUNT(*) FROM dispositivos d WHERE d.empresa_id = e.id AND d.estado = 'ACTIVO') as dispositivos_activos
      FROM suscripciones s
      JOIN empresas e ON s.empresa_id = e.id
      JOIN planes p ON s.plan_id = p.id
      ORDER BY s.id DESC
    `).all();

    return res.json({ suscripciones });
  } catch (error) {
    return res.status(500).json({ error: 'Error al listar suscripciones globales.', details: error.message });
  }
}

/**
 * 💰 Listado Global de Todos los Pagos
 */
export function getAllPayments(req, res) {
  try {
    const payments = db.prepare(`
      SELECT 
        p.*,
        e.nombre AS empresa_nombre,
        pl.nombre AS plan_nombre
      FROM pagos p
      JOIN empresas e ON p.empresa_id = e.id
      LEFT JOIN suscripciones s ON p.suscripcion_id = s.id
      LEFT JOIN planes pl ON s.plan_id = pl.id
      ORDER BY p.fecha_pago DESC
      LIMIT 100
    `).all();

    return res.json({ payments });
  } catch (error) {
    return res.status(500).json({ error: 'Error al listar pagos globales.', details: error.message });
  }
}

/**
 * 👥 Listado Global de Todos los Usuarios
 */
export function getAllUsersGlobal(req, res) {
  try {
    const usuarios = db.prepare(`
      SELECT 
        u.id, u.nombre, u.apellido, u.usuario, u.rol, u.estado, u.email, u.telefono,
        u.empresa_id, u.fecha_creacion,
        e.nombre AS empresa_nombre
      FROM usuarios u
      LEFT JOIN empresas e ON u.empresa_id = e.id
      ORDER BY u.id DESC
    `).all();

    return res.json({ usuarios });
  } catch (error) {
    return res.status(500).json({ error: 'Error al listar usuarios globales.', details: error.message });
  }
}

/**
 * 🛠️ Modificar límites y configuración de un Plan Comercial
 */
export function updatePlanConfig(req, res) {
  const { id } = req.params;
  const { precio, max_usuarios, max_almacenes, max_dispositivos, caracteristicas } = req.body;

  try {
    const existing = db.prepare('SELECT * FROM planes WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Plan no encontrado.' });
    }

    const charsStr = Array.isArray(caracteristicas)
      ? JSON.stringify(caracteristicas)
      : (caracteristicas || existing.caracteristicas);

    db.prepare(`
      UPDATE planes SET
        precio = COALESCE(?, precio),
        max_usuarios = COALESCE(?, max_usuarios),
        max_almacenes = COALESCE(?, max_almacenes),
        max_dispositivos = COALESCE(?, max_dispositivos),
        caracteristicas = ?
      WHERE id = ?
    `).run(
      precio !== undefined ? Number(precio) : null,
      max_usuarios !== undefined ? Number(max_usuarios) : null,
      max_almacenes !== undefined ? Number(max_almacenes) : null,
      max_dispositivos !== undefined ? Number(max_dispositivos) : null,
      charsStr,
      id
    );

    const updated = db.prepare('SELECT * FROM planes WHERE id = ?').get(id);

    logActivity({
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'PLAN_MODIFICADO',
      detalles: `Plan ${updated.nombre} actualizado (Max Disp: ${updated.max_dispositivos}, Max Users: ${updated.max_usuarios}).`,
      ip_origen: req.ip
    });

    return res.json({
      message: `Plan "${updated.nombre}" actualizado correctamente.`,
      plan: updated
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al actualizar configuración del plan.', details: error.message });
  }
}

/**
 * 🗑️ ELIMINAR EMPRESA (TENANT COMPLETO):
 * Elimina atómicamente la empresa y todos sus datos relacionados
 * (usuarios, productos, movimientos, categorías, suscripciones, pagos, dispositivos, respaldos, logs).
 */
export function deleteEmpresa(req, res) {
  const { id } = req.params;
  const empresaId = Number(id);

  if (!empresaId) {
    return res.status(400).json({ error: 'ID de empresa inválido.' });
  }

  try {
    const empresa = db.prepare('SELECT * FROM empresas WHERE id = ?').get(empresaId);
    if (!empresa) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }

    transaction((dbTx) => {
      // 1. Eliminar movimientos
      dbTx.prepare('DELETE FROM movimientos WHERE empresa_id = ?').run(empresaId);

      // 2. Eliminar productos
      dbTx.prepare('DELETE FROM productos WHERE empresa_id = ?').run(empresaId);

      // 3. Eliminar categorías
      dbTx.prepare('DELETE FROM categorias WHERE empresa_id = ?').run(empresaId);

      // 4. Eliminar sincronizaciones y respaldos
      dbTx.prepare('DELETE FROM sincronizacion_logs WHERE empresa_id = ?').run(empresaId);
      dbTx.prepare('DELETE FROM respaldos WHERE empresa_id = ?').run(empresaId);
      dbTx.prepare('DELETE FROM configuracion_almacenamiento WHERE empresa_id = ?').run(empresaId);

      // 5. Eliminar dispositivos
      dbTx.prepare('DELETE FROM dispositivos WHERE empresa_id = ?').run(empresaId);

      // 6. Eliminar pagos y suscripciones
      dbTx.prepare('DELETE FROM pagos WHERE empresa_id = ?').run(empresaId);
      dbTx.prepare('DELETE FROM suscripciones WHERE empresa_id = ?').run(empresaId);

      // 7. Eliminar usuarios asociados a esta empresa (nunca superadmin)
      dbTx.prepare("DELETE FROM usuarios WHERE empresa_id = ? AND rol != 'SUPERADMIN'").run(empresaId);

      // 8. Eliminar logs de actividad de la empresa
      dbTx.prepare('DELETE FROM actividad_logs WHERE empresa_id = ?').run(empresaId);

      // 9. Eliminar la empresa
      dbTx.prepare('DELETE FROM empresas WHERE id = ?').run(empresaId);
    });

    // 10. Limpiar carpeta física de respaldos si existe
    try {
      const tenantBackupDir = path.resolve(__dirname, '../../backups/tenants', String(empresaId));
      if (fs.existsSync(tenantBackupDir)) {
        fs.rmSync(tenantBackupDir, { recursive: true, force: true });
      }
    } catch (fsErr) {
      console.warn('Aviso al limpiar carpeta física de respaldos:', fsErr.message);
    }

    logActivity({
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      empresa_id: null,
      empresa_nombre: 'Plataforma Global',
      accion: 'EMPRESA_ELIMINADA',
      detalles: `Empresa "${empresa.nombre}" (ID: ${empresaId}) fue eliminada permanentemente con todos sus datos asociados.`,
      ip_origen: req.ip
    });

    return res.json({
      ok: true,
      message: `Empresa "${empresa.nombre}" y todos sus datos fueron eliminados exitosamente.`
    });
  } catch (error) {
    console.error('Error al eliminar empresa:', error);
    return res.status(500).json({ error: 'Error al eliminar la empresa.', details: error.message });
  }
}

/**
 * 🗑️ ELIMINAR USUARIO (SUPERADMIN GLOBAL)
 */
export function deleteUserGlobal(req, res) {
  const { id } = req.params;
  const targetId = Number(id);

  if (!targetId) {
    return res.status(400).json({ error: 'ID de usuario inválido.' });
  }

  if (req.user.id === targetId) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de usuario en uso.' });
  }

  try {
    const targetUser = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(targetId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    if (targetUser.rol === 'SUPERADMIN' && targetUser.id === 1) {
      return res.status(400).json({ error: 'No se puede eliminar la cuenta principal de SuperAdmin.' });
    }

    transaction((dbTx) => {
      // Reasignar movimientos para no violar integridad referencial
      dbTx.prepare('UPDATE movimientos SET usuario_id = ? WHERE usuario_id = ?').run(req.user.id, targetId);

      // Limpiar configuraciones de almacenamiento y logs de sincronización
      dbTx.prepare('DELETE FROM configuracion_almacenamiento WHERE usuario_id = ?').run(targetId);
      dbTx.prepare('DELETE FROM sincronizacion_logs WHERE usuario_id = ?').run(targetId);

      // Eliminar el usuario
      dbTx.prepare('DELETE FROM usuarios WHERE id = ?').run(targetId);
    });

    logActivity({
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      empresa_id: targetUser.empresa_id,
      accion: 'USUARIO_ELIMINADO',
      detalles: `Usuario "${targetUser.usuario}" (${targetUser.nombre}) eliminado por SuperAdmin.`,
      ip_origen: req.ip
    });

    return res.json({
      ok: true,
      message: `Usuario "${targetUser.usuario}" eliminado exitosamente.`
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al eliminar usuario.', details: error.message });
  }
}
