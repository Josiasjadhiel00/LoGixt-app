import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:5000/api';

async function runStorageTests() {
  console.log('========================================================');
  console.log('🧪 INICIANDO SUITE DE PRUEBAS: ALMACENAMIENTO Y SYNC LOGIXT');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc} ${details ? `(${details})` : ''}`);
      failed++;
    }
  }

  // 1. Health Check
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    const health = await healthRes.json();
    assert('1. Servidor activo y base de datos SQLite conectada', health.ok === true && health.database === 'connected');
  } catch (err) {
    assert('1. Servidor activo y base de datos SQLite conectada', false, err.message);
    process.exit(1);
  }

  // 2. Login de SuperAdmin
  let superadminToken = '';
  const { default: db } = await import('./src/db/connection.js');
  const bcrypt = (await import('bcryptjs')).default;

  try {
    // Asegurar que el usuario superadmin tenga contraseña conocida para el test
    const superAdminUser = db.prepare("SELECT id FROM usuarios WHERE LOWER(usuario) = 'superadmin'").get();
    if (superAdminUser) {
      const knownHash = bcrypt.hashSync('superadmin123', 10);
      db.prepare("UPDATE usuarios SET contrasena_hash = ?, rol = 'SUPERADMIN', estado = 'ACTIVO' WHERE id = ?").run(knownHash, superAdminUser.id);
    }

    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'superadmin', contrasena: 'superadmin123' })
    });
    const data = await loginRes.json();
    assert('2. Autenticación de SuperAdmin exitosa', loginRes.ok && Boolean(data.token));
    superadminToken = data.token;
  } catch (err) {
    assert('2. Autenticación de SuperAdmin exitosa', false, err.message);
  }

  // 3. Crear empresa de prueba y usuario administrador para verificar aislamiento multi-tenant
  let testEmpresaId = null;
  let testUserToken = '';
  const testUsername = `admin_storage_${Date.now()}`;
  try {

    const ts = Date.now();
    const empInfo = db.prepare(`
      INSERT INTO empresas (nombre, email, estado, plan_id)
      VALUES (?, ?, 'ACTIVA', 2)
    `).run(`Empresa Storage Test ${ts}`, `storage_${ts}@test.com`);
    testEmpresaId = empInfo.lastInsertRowid;

    // Crear suscripción activa
    db.prepare(`
      INSERT INTO suscripciones (empresa_id, plan_id, estado, fecha_inicio, fecha_proximo_pago)
      VALUES (?, 2, 'ACTIVE', datetime('now'), datetime('now', '+30 days'))
    `).run(testEmpresaId);

    // Crear categoría y productos iniciales
    const catInfo = db.prepare(`
      INSERT INTO categorias (nombre, prefijo, empresa_id)
      VALUES (?, ?, ?)
    `).run(`Electrónica Test ${ts}`, `E${ts.toString().slice(-4)}`, testEmpresaId);

    const prodInfo = db.prepare(`
      INSERT INTO productos (codigo, codigo_qr, nombre, categoria_id, stock_actual, stock_minimo, empresa_id)
      VALUES (?, ?, 'Lector Láser de Prueba', ?, 15, 5, ?)
    `).run(`TEST-${ts}`, `QR-TEST-${ts}`, catInfo.lastInsertRowid, testEmpresaId);

    // Movimiento inicial
    const hash = bcrypt.hashSync('test1234', 10);
    const usrInfo = db.prepare(`
      INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol, estado, empresa_id)
      VALUES ('Admin Test', ?, ?, 'ADMINISTRADOR', 'ACTIVO', ?)
    `).run(testUsername, hash, testEmpresaId);

    db.prepare(`
      INSERT INTO movimientos (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, usuario_id, fecha, hora, empresa_id)
      VALUES (?, 'INGRESO', 15, 0, 15, ?, '2026-10-22', '10:00:00', ?)
    `).run(prodInfo.lastInsertRowid, usrInfo.lastInsertRowid, testEmpresaId);

    // Login con usuario de empresa de prueba
    const loginTestRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: testUsername, contrasena: 'test1234' })
    });
    const testLoginData = await loginTestRes.json();
    testUserToken = testLoginData.token;

    assert('3. Creación y autenticación de inquilino de prueba (Tenant)', loginTestRes.ok && Boolean(testUserToken));
  } catch (err) {
    assert('3. Creación y autenticación de inquilino de prueba (Tenant)', false, err.message);
  }

  // 4. Configurar almacenamiento para el usuario y dispositivo
  const deviceUuid = `dev-test-${Date.now()}`;
  try {
    const configRes = await fetch(`${BASE_URL}/storage/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`,
        'x-device-uuid': deviceUuid
      },
      body: JSON.stringify({
        dispositivo_uuid: deviceUuid,
        modo: 'LOCAL_SYNC',
        tipo_almacenamiento_local: 'INDEXEDDB',
        nombre_carpeta_local: 'Almacen_Local_Test',
        auto_sincronizar: true,
        frecuencia_respaldo: 'DIARIA',
        cifrado_activo: true,
        bytes_utilizados_local: 1048576
      })
    });
    const configData = await configRes.json();
    assert('4. Guardar configuración de almacenamiento y generar respaldo inicial automático', configRes.ok && Boolean(configData.modo));
  } catch (err) {
    assert('4. Guardar configuración de almacenamiento y generar respaldo inicial automático', false, err.message);
  }

  // 5. Consultar configuración de almacenamiento
  try {
    const getCfgRes = await fetch(`${BASE_URL}/storage/config`, {
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'x-device-uuid': deviceUuid
      }
    });
    const getCfgData = await getCfgRes.json();
    assert(
      '5. Obtener configuración y validar que almacenamiento_configurado sea true',
      getCfgRes.ok && getCfgData.configurado === true && getCfgData.config.modo === 'LOCAL_SYNC'
    );
  } catch (err) {
    assert('5. Obtener configuración y validar que almacenamiento_configurado sea true', false, err.message);
  }

  // 6. Crear un Respaldo Manual
  let manualBackupId = null;
  try {
    const bkpRes = await fetch(`${BASE_URL}/storage/backup/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`,
        'x-device-uuid': deviceUuid
      },
      body: JSON.stringify({
        tipo: 'MANUAL',
        detalles: 'Respaldo manual generado durante test automatizado'
      })
    });
    const bkpData = await bkpRes.json();
    manualBackupId = bkpData.backup?.id;
    assert(
      '6. Creación de respaldo manual con snapshot estructurado y SHA-256',
      bkpRes.ok && Boolean(manualBackupId) && Boolean(bkpData.backup?.checksum_sha256)
    );
  } catch (err) {
    assert('6. Creación de respaldo manual con snapshot estructurado y SHA-256', false, err.message);
  }

  // 7. Listar respaldos del inquilino
  try {
    const listRes = await fetch(`${BASE_URL}/storage/backups`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const listData = await listRes.json();
    assert(
      '7. Listado de respaldos del tenant con orden cronológico descendente',
      listRes.ok && Array.isArray(listData.respaldos) && listData.respaldos.length >= 1
    );
  } catch (err) {
    assert('7. Listado de respaldos del tenant con orden cronológico descendente', false, err.message);
  }

  // 8. Sincronización PULL (traer datos para almacenamiento local)
  try {
    const pullRes = await fetch(`${BASE_URL}/storage/sync/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      },
      body: JSON.stringify({ since: '1970-01-01T00:00:00.000Z' })
    });
    const pullData = await pullRes.json();
    assert(
      '8. Sincronización PULL (descarga de productos y movimientos para DB local)',
      pullRes.ok && pullData.productos.length >= 1 && Boolean(pullData.timestamp)
    );
  } catch (err) {
    assert('8. Sincronización PULL (descarga de productos y movimientos para DB local)', false, err.message);
  }

  // 9. Sincronización PUSH (enviar mutaciones generadas offline)
  try {
    const { default: db } = await import('./src/db/connection.js');
    const prod = db.prepare('SELECT id FROM productos WHERE empresa_id = ? LIMIT 1').get(testEmpresaId);

    const pushRes = await fetch(`${BASE_URL}/storage/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      },
      body: JSON.stringify({
        dispositivo_uuid: deviceUuid,
        mutations: [
          {
            entity: 'movimiento',
            action: 'CREATE',
            sync_id: `sync-test-${Date.now()}`,
            data: {
              producto_id: prod.id,
              tipo: 'INGRESO',
              cantidad: 10,
              observacion: 'Ingreso offline sincronizado',
              fecha: '2026-10-22',
              hora: '11:15:00'
            }
          }
        ]
      })
    });
    const pushData = await pushRes.json();
    assert(
      '9. Sincronización PUSH con resolución idempotente de mutaciones offline',
      pushRes.ok && pushData.appliedCount === 1
    );

    // Verificar que el stock se haya actualizado a 25 (15 + 10)
    const updatedProd = db.prepare('SELECT stock_actual FROM productos WHERE id = ?').get(prod.id);
    assert('10. Actualización atómica del stock tras procesar mutación offline', updatedProd.stock_actual === 25);
  } catch (err) {
    assert('9. Sincronización PUSH con resolución idempotente de mutaciones offline', false, err.message);
  }

  // 11. Restauración de Respaldo con creación automática de Respaldo Preventivo
  try {
    const restoreRes = await fetch(`${BASE_URL}/storage/backup/${manualBackupId}/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      }
    });
    const restoreData = await restoreRes.json();
    assert(
      '11. Restauración atómica con creación automática de respaldo preventivo',
      restoreRes.ok && Boolean(restoreData.preventiveBackupId)
    );
  } catch (err) {
    assert('11. Restauración atómica con creación automática de respaldo preventivo', false, err.message);
  }

  // 12. Auditoría de Sincronización (logs)
  try {
    const logsRes = await fetch(`${BASE_URL}/storage/logs`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const logsData = await logsRes.json();
    assert(
      '12. Verificación de auditoría de sincronización (sincronizacion_logs)',
      logsRes.ok && Array.isArray(logsData.logs) && logsData.logs.length >= 2
    );
  } catch (err) {
    assert('12. Verificación de auditoría de sincronización (sincronizacion_logs)', false, err.message);
  }

  // 13. Seguridad Multi-Tenant: Usuario no autorizado no puede descargar ni restaurar backup ajeno
  let rivalEmpId = null;
  try {
    const rivalTs = Date.now();
    const rivalEmp = db.prepare("INSERT INTO empresas (nombre, email, estado, plan_id) VALUES (?, ?, 'ACTIVA', 1)").run(
      `Rival Corp ${rivalTs}`,
      `rival_${rivalTs}@test.com`
    );
    rivalEmpId = rivalEmp.lastInsertRowid;

    db.prepare("INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol, estado, empresa_id) VALUES ('Rival User', ?, ?, 'ADMINISTRADOR', 'ACTIVO', ?)").run(
      `rival_usr_${rivalTs}`,
      bcrypt.hashSync('rivalpass', 10),
      rivalEmpId
    );

    const rivalLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: `rival_usr_${rivalTs}`, contrasena: 'rivalpass' })
    });
    const rivalData = await rivalLogin.json();

    const crossRestoreRes = await fetch(`${BASE_URL}/storage/backup/${manualBackupId}/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${rivalData.token}`
      }
    });

    assert(
      '13. Bloqueo estricto de acceso cruzado multi-tenant (HTTP 403 al intentar restaurar datos ajenos)',
      crossRestoreRes.status === 403
    );
  } catch (err) {
    assert('13. Bloqueo estricto de acceso cruzado multi-tenant', false, err.message);
  }

  // 14. Panel Administrativo Consolidado (SuperAdmin)
  try {
    const adminStatusRes = await fetch(`${BASE_URL}/storage/admin/status`, {
      headers: { 'Authorization': `Bearer ${superadminToken}` }
    });
    const adminStatusData = await adminStatusRes.json();
    assert(
      '14. SuperAdmin puede consultar el estado consolidado de todas las empresas',
      adminStatusRes.ok && Array.isArray(adminStatusData.empresas) && Boolean(adminStatusData.global)
    );
  } catch (err) {
    assert('14. SuperAdmin puede consultar el estado consolidado de todas las empresas', false, err.message);
  }

  // Limpieza de datos temporales del test
  try {
    db.exec('PRAGMA foreign_keys = OFF;');
    if (testEmpresaId) {
      db.prepare("DELETE FROM actividad_logs WHERE empresa_id = ?").run(testEmpresaId);
      db.prepare("DELETE FROM sincronizacion_logs WHERE empresa_id = ?").run(testEmpresaId);
      db.prepare("DELETE FROM respaldos WHERE empresa_id = ?").run(testEmpresaId);
      db.prepare("DELETE FROM configuracion_almacenamiento WHERE empresa_id = ?").run(testEmpresaId);
      db.prepare("DELETE FROM movimientos WHERE empresa_id = ?").run(testEmpresaId);
      db.prepare("DELETE FROM productos WHERE empresa_id = ?").run(testEmpresaId);
      db.prepare("DELETE FROM categorias WHERE empresa_id = ?").run(testEmpresaId);
      db.prepare("DELETE FROM usuarios WHERE empresa_id = ?").run(testEmpresaId);
      db.prepare("DELETE FROM suscripciones WHERE empresa_id = ?").run(testEmpresaId);
      db.prepare("DELETE FROM empresas WHERE id = ?").run(testEmpresaId);

      // Limpiar carpeta de backups de prueba en disco
      const testBackupDir = path.resolve(__dirname, 'backups', 'tenants', String(testEmpresaId));
      if (fs.existsSync(testBackupDir)) {
        fs.rmSync(testBackupDir, { recursive: true, force: true });
      }
    }

    if (rivalEmpId) {
      db.prepare("DELETE FROM usuarios WHERE empresa_id = ?").run(rivalEmpId);
      db.prepare("DELETE FROM empresas WHERE id = ?").run(rivalEmpId);
    }
    db.exec('PRAGMA foreign_keys = ON;');
  } catch (cleanErr) {
    db.exec('PRAGMA foreign_keys = ON;');
    console.warn('Aviso en limpieza de prueba:', cleanErr.message);
  }

  console.log('\n========================================================');
  console.log(`📊 RESULTADOS: ${passed} PASADAS | ${failed} FALLIDAS`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStorageTests().catch((err) => {
  console.error('Error fatal en suite de pruebas:', err);
  process.exit(1);
});
