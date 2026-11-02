import db, { transaction } from './connection.js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export function runSaaSMigrations() {
  console.log('🔄 Ejecutando migraciones SaaS y Multi-Tenant...');

  // 1. Crear tabla de Planes
  db.exec(`
    CREATE TABLE IF NOT EXISTS planes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      precio REAL NOT NULL,
      periodo TEXT DEFAULT 'MENSUAL',
      max_usuarios INTEGER NOT NULL DEFAULT 5,
      max_almacenes INTEGER NOT NULL DEFAULT 1,
      caracteristicas TEXT,
      estado TEXT DEFAULT 'ACTIVO',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Crear tabla de Empresas
  db.exec(`
    CREATE TABLE IF NOT EXISTS empresas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      telefono TEXT,
      logo TEXT,
      estado TEXT CHECK(estado IN ('ACTIVA', 'SUSPENDIDA', 'INACTIVA')) NOT NULL DEFAULT 'ACTIVA',
      plan_id INTEGER REFERENCES planes(id),
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Crear tabla de Suscripciones
  db.exec(`
    CREATE TABLE IF NOT EXISTS suscripciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      plan_id INTEGER NOT NULL REFERENCES planes(id),
      estado TEXT CHECK(estado IN ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'SUSPENDED')) NOT NULL DEFAULT 'ACTIVE',
      fecha_inicio TEXT NOT NULL,
      fecha_proximo_pago TEXT NOT NULL,
      fecha_cancelacion TEXT,
      payment_customer_id TEXT,
      payment_subscription_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 4. Crear tabla de Pagos
  db.exec(`
    CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id),
      suscripcion_id INTEGER REFERENCES suscripciones(id),
      monto REAL NOT NULL,
      moneda TEXT DEFAULT 'USD',
      estado TEXT CHECK(estado IN ('PAGADO', 'FALLIDO', 'PENDIENTE')) NOT NULL DEFAULT 'PAGADO',
      payment_id TEXT UNIQUE,
      metodo_pago TEXT DEFAULT 'TARJETA',
      fecha_pago DATETIME DEFAULT CURRENT_TIMESTAMP,
      comprobante_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 5. Crear tabla de Configuración SaaS (período de gracia, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS configuracion_saas (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
  `);

  // 6. Crear tabla de Webhook Logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evento TEXT NOT NULL,
      proveedor TEXT DEFAULT 'GATEWAY_PAGOS',
      payload TEXT NOT NULL,
      procesado INTEGER DEFAULT 1,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Helper para verificar si existe una columna
  function columnExists(tableName, columnName) {
    const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return tableInfo.some((col) => col.name === columnName);
  }

  // 7. Añadir empresa_id a tablas existentes si no existen
  if (!columnExists('usuarios', 'empresa_id')) {
    db.exec('ALTER TABLE usuarios ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)');
  }
  if (!columnExists('categorias', 'empresa_id')) {
    db.exec('ALTER TABLE categorias ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)');
  }
  if (!columnExists('productos', 'empresa_id')) {
    db.exec('ALTER TABLE productos ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)');
  }
  if (!columnExists('movimientos', 'empresa_id')) {
    db.exec('ALTER TABLE movimientos ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)');
  }

  // 8. Crear índices para consultas multi-tenant ultrarrápidas
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa_id);
    CREATE INDEX IF NOT EXISTS idx_categorias_empresa ON categorias(empresa_id);
    CREATE INDEX IF NOT EXISTS idx_productos_empresa ON productos(empresa_id);
    CREATE INDEX IF NOT EXISTS idx_movimientos_empresa ON movimientos(empresa_id);
    CREATE INDEX IF NOT EXISTS idx_suscripciones_empresa ON suscripciones(empresa_id);
    CREATE INDEX IF NOT EXISTS idx_pagos_empresa ON pagos(empresa_id);
  `);

  // 9. Sembrar Planes y Configuración Inicial si están vacíos
  const planCount = db.prepare('SELECT COUNT(*) as count FROM planes').get().count;
  if (planCount === 0) {
    console.log('🌱 Sembrando planes comerciales SaaS...');
    const insertPlan = db.prepare(`
      INSERT INTO planes (codigo, nombre, precio, periodo, max_usuarios, max_almacenes, caracteristicas)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertPlan.run(
      'BASICO',
      'Plan Básico',
      29.00,
      'MENSUAL',
      3,
      1,
      JSON.stringify([
        'Hasta 3 usuarios operativos',
        '1 almacén físico central',
        'Catálogo ilimitado de productos',
        'Control de entradas y salidas con escáner',
        'Reportes de inventario básicos'
      ])
    );

    insertPlan.run(
      'PROFESIONAL',
      'Plan Profesional',
      79.00,
      'MENSUAL',
      10,
      3,
      JSON.stringify([
        'Hasta 10 usuarios simultáneos',
        'Hasta 3 almacenes independientes',
        'Escaneo con lector USB, cámara y códigos QR',
        'Historial de movimientos inmutable',
        'Alertas de reposición avanzadas',
        'Impresión de etiquetas con código de barras'
      ])
    );

    insertPlan.run(
      'EMPRESA',
      'Plan Empresa',
      199.00,
      'MENSUAL',
      50,
      10,
      JSON.stringify([
        'Usuarios ilimitados (hasta 50 asignados)',
        'Hasta 10 almacenes o sucursales',
        'Auditoría y trazabilidad completa de operaciones',
        'Soporte prioritario 24/7',
        'Exportación de datos e integración API'
      ])
    );
  }

  // Configuración por defecto: 5 días de período de gracia
  db.prepare(`
    INSERT OR IGNORE INTO configuracion_saas (clave, valor)
    VALUES ('dias_periodo_gracia', '5')
  `).run();

  const shouldSeedDemo = process.env.SEED_DEMO_DATA === 'true' || (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO_DATA !== 'false');

  // 10. Asegurar que existe al menos la Empresa 1 (TechLogix S.A.) en modo DEMO
  if (shouldSeedDemo) {
    const empresaCount = db.prepare('SELECT COUNT(*) as count FROM empresas').get().count;
    if (empresaCount === 0) {
      console.log('🌱 Creando Empresa Inicial Demo (TechLogix S.A.)...');
      const proPlan = db.prepare("SELECT id FROM planes WHERE codigo = 'PROFESIONAL'").get();
      const planId = proPlan ? proPlan.id : 2;

      const resEmpresa = db.prepare(`
        INSERT INTO empresas (nombre, email, telefono, estado, plan_id)
        VALUES (?, ?, ?, ?, ?)
      `).run('TechLogix Soluciones S.A.', 'contacto@techlogix.com', '+1 (555) 019-2834', 'ACTIVA', planId);

      const empresaId = Number(resEmpresa.lastInsertRowid);

      // Fecha hoy y próximo mes
      const hoy = new Date();
      const proximoMes = new Date();
      proximoMes.setDate(proximoMes.getDate() + 30);

      const fechaInicio = hoy.toISOString().split('T')[0];
      const fechaProximoPago = proximoMes.toISOString().split('T')[0];

      // Suscripción Activa
      const resSub = db.prepare(`
        INSERT INTO suscripciones (empresa_id, plan_id, estado, fecha_inicio, fecha_proximo_pago, payment_customer_id, payment_subscription_id)
        VALUES (?, ?, 'ACTIVE', ?, ?, 'cus_demo_techlogix', 'sub_demo_techlogix')
      `).run(empresaId, planId, fechaInicio, fechaProximoPago);

      const subId = Number(resSub.lastInsertRowid);

      // Pago registrado inicial
      db.prepare(`
        INSERT INTO pagos (empresa_id, suscripcion_id, monto, moneda, estado, payment_id, metodo_pago)
        VALUES (?, ?, 79.00, 'USD', 'PAGADO', 'pay_init_techlogix_001', 'TARJETA DE CRÉDITO')
      `).run(empresaId, subId);

      // Asignar todos los registros previos de usuarios, categorías, productos y movimientos a la Empresa 1
      db.prepare('UPDATE usuarios SET empresa_id = ? WHERE empresa_id IS NULL').run(empresaId);
      db.prepare('UPDATE categorias SET empresa_id = ? WHERE empresa_id IS NULL').run(empresaId);
      db.prepare('UPDATE productos SET empresa_id = ? WHERE empresa_id IS NULL').run(empresaId);
      db.prepare('UPDATE movimientos SET empresa_id = ? WHERE empresa_id IS NULL').run(empresaId);
    } else {
      // Si ya existe la Empresa 1 pero hay registros huérfanos, asignarlos
      const primeraEmpresa = db.prepare('SELECT id FROM empresas ORDER BY id ASC LIMIT 1').get();
      if (primeraEmpresa) {
        db.prepare('UPDATE usuarios SET empresa_id = ? WHERE empresa_id IS NULL').run(primeraEmpresa.id);
        db.prepare('UPDATE categorias SET empresa_id = ? WHERE empresa_id IS NULL').run(primeraEmpresa.id);
        db.prepare('UPDATE productos SET empresa_id = ? WHERE empresa_id IS NULL').run(primeraEmpresa.id);
        db.prepare('UPDATE movimientos SET empresa_id = ? WHERE empresa_id IS NULL').run(primeraEmpresa.id);
      }
    }
  }

  // 11. Crear o Asegurar Usuario SUPERADMIN de Plataforma (sin empresa_id asignado)
  const superAdminExists = db.prepare("SELECT id FROM usuarios WHERE LOWER(usuario) = 'superadmin'").get();
  if (!superAdminExists) {
    console.log('👑 Creando usuario Propietario de Plataforma (superadmin)...');
    const isProd = process.env.NODE_ENV === 'production';
    let initialPassword = process.env.SUPERADMIN_INITIAL_PASSWORD;
    let autoGenerated = false;

    if (!initialPassword || !initialPassword.trim()) {
      if (isProd) {
        initialPassword = crypto.randomBytes(8).toString('hex');
        autoGenerated = true;
      } else {
        initialPassword = 'admin123';
      }
    } else {
      initialPassword = initialPassword.trim();
    }

    const salt = bcrypt.genSaltSync(10);
    const passSuper = bcrypt.hashSync(initialPassword, salt);

    if (autoGenerated) {
      console.log('\n================================================================');
      console.log('🔑 SUPERADMIN INICIAL CREADO (UNA SOLA VEZ):');
      console.log('   Usuario:    superadmin');
      console.log(`   Contraseña: ${initialPassword}`);
      console.log('   ⚠️ Guarde esta contraseña. Cámbiela inmediatamente tras iniciar sesión.');
      console.log('================================================================\n');
    }

    // Actualizar CHECK constraint en usuarios si fuera necesario mediante inserción segura
    try {
      db.prepare(`
        INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol, estado, empresa_id)
        VALUES ('SuperAdmin Plataforma', 'superadmin', ?, 'SUPERADMIN', 'ACTIVO', NULL)
      `).run(passSuper);
    } catch (err) {
      // Si el check constraint original bloquea 'SUPERADMIN', actualizamos la tabla
      console.log('Actualizando tabla usuarios para soportar rol SUPERADMIN...');
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec(`
        DROP TABLE IF EXISTS usuarios_temp;
        CREATE TABLE usuarios_temp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          usuario TEXT UNIQUE NOT NULL,
          contrasena_hash TEXT NOT NULL,
          rol TEXT CHECK(rol IN ('SUPERADMIN', 'ADMINISTRADOR', 'ALMACENERO')) NOT NULL,
          estado TEXT CHECK(estado IN ('ACTIVO', 'INACTIVO')) DEFAULT 'ACTIVO',
          empresa_id INTEGER REFERENCES empresas(id),
          fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO usuarios_temp (id, nombre, usuario, contrasena_hash, rol, estado, empresa_id, fecha_creacion)
        SELECT id, nombre, usuario, contrasena_hash, rol, estado, empresa_id, fecha_creacion FROM usuarios;
        DROP TABLE usuarios;
        ALTER TABLE usuarios_temp RENAME TO usuarios;
        CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa_id);
      `);
      db.exec('PRAGMA foreign_keys = ON;');

      db.prepare(`
        INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol, estado, empresa_id)
        VALUES ('SuperAdmin Plataforma', 'superadmin', ?, 'SUPERADMIN', 'ACTIVO', NULL)
      `).run(passSuper);
    }
  }

  // 12. Crear Segunda Empresa Demo (Empresa B) para demostrar aislamiento multi-tenant
  if (shouldSeedDemo) {
    const segundaEmpresa = db.prepare("SELECT id FROM empresas WHERE email = 'contacto@andinadistribuidora.com'").get();
    if (!segundaEmpresa) {
      console.log('🌱 Creando Segunda Empresa Demo (Distribuidora Andina S.A.) para verificar Multi-Tenancy...');
      const basicoPlan = db.prepare("SELECT id FROM planes WHERE codigo = 'BASICO'").get();
      const planIdB = basicoPlan ? basicoPlan.id : 1;

      const resB = db.prepare(`
        INSERT INTO empresas (nombre, email, telefono, estado, plan_id)
        VALUES (?, ?, ?, ?, ?)
      `).run('Distribuidora Andina S.A.', 'contacto@andinadistribuidora.com', '+54 (11) 4892-3021', 'ACTIVA', planIdB);

      const empresaBId = Number(resB.lastInsertRowid);

      const hoy = new Date();
      const proximoMes = new Date();
      proximoMes.setDate(proximoMes.getDate() + 30);

      // Suscripción Empresa B
      const resSubB = db.prepare(`
        INSERT INTO suscripciones (empresa_id, plan_id, estado, fecha_inicio, fecha_proximo_pago, payment_customer_id, payment_subscription_id)
        VALUES (?, ?, 'ACTIVE', ?, ?, 'cus_demo_andina', 'sub_demo_andina')
      `).run(empresaBId, planIdB, hoy.toISOString().split('T')[0], proximoMes.toISOString().split('T')[0]);

      // Pago Empresa B
      db.prepare(`
        INSERT INTO pagos (empresa_id, suscripcion_id, monto, moneda, estado, payment_id, metodo_pago)
        VALUES (?, ?, 29.00, 'USD', 'PAGADO', 'pay_init_andina_001', 'TARJETA DE DÉBITO')
      `).run(empresaBId, Number(resSubB.lastInsertRowid));

      // Usuario Admin para Empresa B
      const salt = bcrypt.genSaltSync(10);
      const passAndina = bcrypt.hashSync('andina123', salt);
      db.prepare(`
        INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol, estado, empresa_id)
        VALUES ('Lucía Morales', 'admin_andina', ?, 'ADMINISTRADOR', 'ACTIVO', ?)
      `).run(passAndina, empresaBId);

      // Categoría independiente para Empresa B
      const catAndina = Number(db.prepare(`
        INSERT INTO categorias (nombre, descripcion, prefijo, imagen, empresa_id)
        VALUES ('Alimentos y Enlatados', 'Conservas y productos alimenticios empaquetados.', 'ALI', 'https://images.unsplash.com/photo-1584473457406-6240486418e9?auto=format&fit=crop&w=600&q=80', ?)
      `).run(empresaBId).lastInsertRowid);

      // Producto independiente para Empresa B
      const prodAndina = Number(db.prepare(`
        INSERT INTO productos (
          codigo, codigo_barras, codigo_qr, nombre, categoria_id, descripcion,
          unidad_medida, stock_actual, stock_minimo, ubicacion_almacen,
          ubicacion_pasillo, ubicacion_estante, ubicacion_nivel, proveedor, empresa_id
        ) VALUES ('ALI-ATUN-01', '7709876543210', 'WMS-ALI-ATUN-01', 'Atún en Aceite 170g (Pack x24)', ?, 'Lote conservas premium', 'Cajas', 120, 20, 'Almacén Central', 'Pasillo 1', 'Estante C', 'Nivel 1', 'Conservas del Pacífico S.A.', ?)
      `).run(catAndina, empresaBId).lastInsertRowid);

      // Movimiento inicial de ingreso para Empresa B
      const now = new Date();
      db.prepare(`
        INSERT INTO movimientos (
          producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
          usuario_id, observacion, guia_despacho, fecha, hora, empresa_id
        ) VALUES (?, 'INGRESO', 120, 0, 120, (SELECT id FROM usuarios WHERE usuario = 'admin_andina'), 'Recepción lote inicial', 'GD-ANDINA-001', ?, ?, ?)
      `).run(prodAndina, now.toISOString().split('T')[0], now.toTimeString().split(' ')[0], empresaBId);
    }
  }

  // 13. Migraciones Fase 2: Tablas Dispositivos, Actividad y Configuración de Planes
  db.exec(`
    CREATE TABLE IF NOT EXISTS dispositivos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      tipo TEXT CHECK(tipo IN ('Tablet', 'PC', 'Laptop', 'Otro')) NOT NULL DEFAULT 'PC',
      sistema_operativo TEXT,
      version_logixt TEXT DEFAULT 'v1.0.4',
      estado TEXT CHECK(estado IN ('ACTIVO', 'PENDIENTE', 'BLOQUEADO', 'DESACTIVADO')) NOT NULL DEFAULT 'PENDIENTE',
      codigo_activacion TEXT UNIQUE,
      codigo_expiracion DATETIME,
      fecha_activacion DATETIME,
      ultima_conexion DATETIME,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
      creado_por_usuario_id INTEGER REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS actividad_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER REFERENCES usuarios(id),
      usuario_nombre TEXT,
      empresa_id INTEGER REFERENCES empresas(id),
      empresa_nombre TEXT,
      accion TEXT NOT NULL,
      detalles TEXT,
      ip_origen TEXT,
      fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_dispositivos_empresa ON dispositivos(empresa_id);
    CREATE INDEX IF NOT EXISTS idx_dispositivos_codigo ON dispositivos(codigo_activacion);
    CREATE INDEX IF NOT EXISTS idx_actividad_empresa ON actividad_logs(empresa_id);
    CREATE INDEX IF NOT EXISTS idx_actividad_fecha ON actividad_logs(fecha_hora);
  `);

  // Actualizar límites de dispositivos en Planes
  db.prepare("UPDATE planes SET max_dispositivos = 1 WHERE codigo = 'BASICO'").run();
  db.prepare("UPDATE planes SET max_dispositivos = 3 WHERE codigo = 'PROFESIONAL'").run();
  db.prepare("UPDATE planes SET max_dispositivos = 5 WHERE codigo = 'EMPRESA'").run();

  // Sembrado de datos demo de Dispositivos y Actividad
  if (shouldSeedDemo) {
    // Completar datos de perfil en usuarios de demostración si faltan
    db.prepare("UPDATE usuarios SET apellido = 'Mendoza', email = 'carlos.mendoza@techlogix.com', telefono = '+1 (809) 555-0192', tema = 'logixt', color_acento = 'purple' WHERE LOWER(usuario) = 'admin' AND (apellido IS NULL OR apellido = '')").run();
    db.prepare("UPDATE usuarios SET apellido = 'Gómez', email = 'juan.almacen@techlogix.com', telefono = '+1 (809) 555-0144', tema = 'dark', color_acento = 'blue' WHERE LOWER(usuario) = 'almacen' AND (apellido IS NULL OR apellido = '')").run();
    db.prepare("UPDATE usuarios SET apellido = 'Global', email = 'superadmin@logixt.com', telefono = '+1 (800) 564-4980', tema = 'logixt', color_acento = 'purple' WHERE LOWER(usuario) = 'superadmin' AND (apellido IS NULL OR apellido = '')").run();
    db.prepare("UPDATE usuarios SET apellido = 'Morales', email = 'lucia.morales@andinadistribuidora.com', telefono = '+54 (11) 4892-3021', tema = 'logixt', color_acento = 'green' WHERE LOWER(usuario) = 'admin_andina' AND (apellido IS NULL OR apellido = '')").run();

    // Sembrar dispositivos demo si la tabla está vacía y existen empresas 1 y 2
    const deviceCount = db.prepare('SELECT COUNT(*) as count FROM dispositivos').get().count;
    const hasEmpresa1 = db.prepare('SELECT id FROM empresas WHERE id = 1').get();
    const hasEmpresa2 = db.prepare('SELECT id FROM empresas WHERE id = 2').get();

    if (deviceCount === 0 && hasEmpresa1 && hasEmpresa2) {
      console.log('📱 Sembrando dispositivos iniciales demo...');
      const nowIso = new Date().toISOString();
      
      // Empresa 1 (TechLogix): 2 dispositivos activos (Plan Profesional permite 3)
      db.prepare(`
        INSERT INTO dispositivos (uuid, nombre, empresa_id, tipo, sistema_operativo, version_logixt, estado, fecha_activacion, ultima_conexion, fecha_registro)
        VALUES 
          ('dev-tech-tab-001', 'TABLET-001 Almacén Central', 1, 'Tablet', 'Android 14 (Samsung Galaxy Tab Active)', 'v1.0.4', 'ACTIVO', ?, ?, ?),
          ('dev-tech-pc-001', 'PC-001 Despacho Principal', 1, 'PC', 'Windows 11 Pro 64-bit', 'v1.0.4', 'ACTIVO', ?, ?, ?)
      `).run(nowIso, nowIso, nowIso, nowIso, nowIso, nowIso);

      // Empresa 2 (Distribuidora Andina): 1 dispositivo activo (Plan Básico permite 1)
      db.prepare(`
        INSERT INTO dispositivos (uuid, nombre, empresa_id, tipo, sistema_operativo, version_logixt, estado, fecha_activacion, ultima_conexion, fecha_registro)
        VALUES 
          ('dev-andina-pc-001', 'PC-001 Recepción Andina', 2, 'PC', 'Windows 10 Enterprise', 'v1.0.4', 'ACTIVO', ?, ?, ?)
      `).run(nowIso, nowIso, nowIso);
    }

    // Sembrar registros iniciales en actividad_logs si está vacía
    const activityCount = db.prepare('SELECT COUNT(*) as count FROM actividad_logs').get().count;
    if (activityCount === 0 && hasEmpresa1 && hasEmpresa2) {
      console.log('📋 Sembrando registros de auditoría iniciales demo...');
      db.prepare(`
        INSERT INTO actividad_logs (usuario_nombre, empresa_id, empresa_nombre, accion, detalles, fecha_hora)
        VALUES
          ('SuperAdmin Plataforma', 1, 'TechLogix S.A.', 'EMPRESA_CREADA', 'Alta inicial de TechLogix con Plan Profesional', datetime('now', '-5 days')),
          ('SuperAdmin Plataforma', 1, 'TechLogix S.A.', 'PAGO_REGISTRADO', 'Pago inicial de $79.00 USD procesado', datetime('now', '-5 days')),
          ('Carlos Mendoza', 1, 'TechLogix S.A.', 'DISPOSITIVO_ACTIVADO', 'Dispositivo TABLET-001 activado exitosamente', datetime('now', '-4 days')),
          ('Carlos Mendoza', 1, 'TechLogix S.A.', 'DISPOSITIVO_ACTIVADO', 'Dispositivo PC-001 activado exitosamente', datetime('now', '-3 days')),
          ('SuperAdmin Plataforma', 2, 'Distribuidora Andina S.A.', 'EMPRESA_CREADA', 'Alta de Distribuidora Andina con Plan Básico', datetime('now', '-2 days')),
          ('Lucía Morales', 2, 'Distribuidora Andina S.A.', 'DISPOSITIVO_ACTIVADO', 'Dispositivo PC-001 Recepción Andina activado', datetime('now', '-1 days'))
      `).run();
    }
  } else {
    console.log('ℹ️ Entorno de producción: Creación de empresas y dispositivos de demostración omitida.');
  }

  console.log('✅ Migraciones SaaS y Multi-Tenant ejecutadas correctamente.');
}
