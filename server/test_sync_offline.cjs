const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (process.env.LOGIXT_SYNC_TEST_WORKER === '1') {
  runWorker().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logixt-sync-test-'));
  const dbPath = path.join(testDir, 'database.sqlite');
  const child = spawnSync(process.execPath, [__filename], {
    encoding: 'utf8',
    env: { ...process.env, DB_PATH: dbPath, LOGIXT_SYNC_TEST_WORKER: '1' },
    timeout: 30000
  });

  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  fs.rmSync(testDir, { recursive: true, force: true });
  process.exitCode = child.status === 0 ? 0 : (child.status || 1);
}

async function runWorker() {
  const { default: db } = await import('./src/db/connection.js');
  const { syncPull, syncPush } = await import('./src/controllers/storageController.js');
  const planId = Number(db.prepare(`
    INSERT INTO planes (codigo, nombre, precio) VALUES ('SYNC-TEST', 'Plan sync test', 0)
  `).run().lastInsertRowid);
  const empresaId = Number(db.prepare(`
    INSERT INTO empresas (nombre, email, plan_id) VALUES ('Empresa sync test', 'sync-test@example.invalid', ?)
  `).run(planId).lastInsertRowid);
  const userId = Number(db.prepare(`
    INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol, empresa_id)
    VALUES ('Administrador sync test', 'sync-test-admin', 'not-used', 'ADMINISTRADOR', ?)
  `).run(empresaId).lastInsertRowid);
  const warehouseUserId = Number(db.prepare(`
    INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol, empresa_id)
    VALUES ('Almacenero sync test', 'sync-test-worker', 'not-used', 'ALMACENERO', ?)
  `).run(empresaId).lastInsertRowid);
  const productId = Number(db.prepare(`
    INSERT INTO productos (codigo, codigo_qr, nombre, stock_actual, empresa_id)
    VALUES ('SYNC-TEST-PRODUCT', 'SYNC-TEST-QR', 'Producto prueba sync', 10, ?)
  `).run(empresaId).lastInsertRowid);
  const deviceUuid = 'sync-test-device';

  const makeMutation = (syncId, type, data, overrides = {}) => ({
    sync_id: syncId,
    entity: 'movimiento',
    action: 'CREATE',
    user_id: userId,
    empresa_id: empresaId,
    data: {
      producto_id: productId,
      tipo: type,
      stock_base: 10,
      ocurrido_en: '2026-10-31T12:00:00.000Z',
      ...data
    },
    ...overrides
  });
  const push = (mutations, user = { id: userId, empresa_id: empresaId, rol: 'ADMINISTRADOR' }) => {
    const response = {
      statusCode: 200,
      body: null,
      status(statusCode) { this.statusCode = statusCode; return this; },
      json(body) { this.body = body; return this; }
    };
    syncPush({
      user,
      headers: { 'x-device-uuid': deviceUuid },
      body: { dispositivo_uuid: deviceUuid, mutations }
    }, response);
    return response;
  };
  const assert = (condition, message) => {
    if (!condition) throw new Error(`FAIL: ${message}`);
    console.log(`PASS: ${message}`);
  };
  const { deleteBackup, restoreBackup } = await import('./src/controllers/storageController.js');
  const backupResponse = () => ({
    statusCode: 200,
    body: null,
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; }
  });
  const workerRequest = {
    user: { id: warehouseUserId, empresa_id: empresaId, rol: 'ALMACENERO' },
    params: { id: '1' }
  };
  const deleteDenied = backupResponse();
  deleteBackup(workerRequest, deleteDenied);
  assert(deleteDenied.statusCode === 403, 'prevents warehouse users from deleting backups');
  const restoreDenied = backupResponse();
  restoreBackup(workerRequest, restoreDenied);
  assert(restoreDenied.statusCode === 403, 'prevents warehouse users from restoring backups');

  const inbound = makeMutation('sync-inbound-001', 'INGRESO', {
    cantidad: 3,
    proveedor: 'Proveedor temporal'
  });
  let response = push([inbound]);
  assert(response.statusCode === 200 && response.body.results[0].status === 'APPLIED', 'applies an inbound mutation');
  assert(db.prepare('SELECT stock_actual FROM productos WHERE id = ?').get(productId).stock_actual === 13, 'updates product stock atomically');
  assert(db.prepare('SELECT proveedor FROM productos WHERE id = ?').get(productId).proveedor === 'Proveedor temporal', 'preserves inbound supplier updates');
  assert(db.prepare('SELECT COUNT(*) AS count FROM movimientos WHERE producto_id = ?').get(productId).count === 1, 'creates exactly one movement');

  response = push([inbound]);
  assert(response.body.results[0].duplicate === true, 'returns the stored receipt for a duplicate sync ID');
  assert(db.prepare('SELECT stock_actual FROM productos WHERE id = ?').get(productId).stock_actual === 13, 'does not apply duplicate stock changes');
  assert(db.prepare('SELECT COUNT(*) AS count FROM movimientos WHERE producto_id = ?').get(productId).count === 1, 'does not create a duplicate movement');

  response = push([makeMutation('sync-stale-dispatch-001', 'DESPACHO', {
    cantidad: 2,
    stock_base: 10
  })]);
  assert(response.body.results[0].status === 'CONFLICT', 'retains a dispatch based on stale stock as a conflict');
  assert(db.prepare('SELECT stock_actual FROM productos WHERE id = ?').get(productId).stock_actual === 13, 'does not alter stock for stale dispatches');

  response = push([makeMutation('sync-insufficient-dispatch-001', 'DESPACHO', {
    cantidad: 20,
    stock_base: 13
  })]);
  assert(response.body.results[0].status === 'CONFLICT', 'rejects a dispatch that exceeds server-side stock');
  assert(db.prepare('SELECT stock_actual FROM productos WHERE id = ?').get(productId).stock_actual === 13, 'does not allow stock to become negative');

  response = push([makeMutation('sync-valid-adjustment-001', 'AJUSTE', {
    stock_base: 13,
    stock_nuevo: 8,
    motivo_ajuste: 'Conteo físico'
  })]);
  assert(response.body.results[0].status === 'APPLIED', 'applies a valid administrator adjustment');
  assert(db.prepare('SELECT stock_actual FROM productos WHERE id = ?').get(productId).stock_actual === 8, 'sets adjusted stock to the requested value');

  const legacyMutation = {
    sync_id: 'sync-legacy-client-001',
    entity: 'movimiento',
    action: 'CREATE',
    data: {
      producto_id: productId,
      tipo: 'INGRESO',
      cantidad: 1,
      fecha: '2026-10-31',
      hora: '13:00:00'
    }
  };
  response = push([legacyMutation]);
  assert(response.body.results[0].status === 'APPLIED', 'accepts an authenticated legacy movement payload');
  assert(db.prepare('SELECT stock_actual FROM productos WHERE id = ?').get(productId).stock_actual === 9, 'preserves compatibility for legacy inbound data');

  response = push([makeMutation('sync-worker-adjustment-001', 'AJUSTE', {
    stock_base: 9,
    stock_nuevo: 5,
    motivo_ajuste: 'Conteo físico'
  }, { user_id: warehouseUserId })], {
    id: warehouseUserId,
    empresa_id: empresaId,
    rol: 'ALMACENERO'
  });
  assert(response.body.results[0].status === 'CONFLICT', 'rejects adjustments from non-administrator users');
  assert(db.prepare('SELECT stock_actual FROM productos WHERE id = ?').get(productId).stock_actual === 9, 'preserves stock after a forbidden adjustment');

  response = push([makeMutation('sync-unsupported-001', 'INGRESO', { cantidad: 2 }, { entity: 'producto' })]);
  assert(response.body.results[0].status === 'CONFLICT', 'explicitly rejects unsupported offline entities');

  response = push([makeMutation('sync-cross-user-001', 'INGRESO', { cantidad: 1 }, { user_id: warehouseUserId })]);
  assert(response.statusCode === 403, 'rejects pending operations owned by a different user');

  response = push([]);
  assert(response.statusCode === 400, 'rejects empty sync batches');

  const pullResponse = {
    statusCode: 200,
    body: null,
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; }
  };
  syncPull({
    user: { id: userId, empresa_id: empresaId },
    headers: { 'x-device-uuid': deviceUuid },
    body: { since: '1970-01-01T00:00:00.000Z' }
  }, pullResponse);
  assert(pullResponse.statusCode === 200 && pullResponse.body.productos.length === 1, 'pull returns the tenant inventory snapshot');
  assert(db.prepare(`
    SELECT COUNT(*) AS count FROM sincronizacion_logs
    WHERE empresa_id = ? AND tipo_operacion = 'SUBIDA' AND estado = 'FALLIDO'
  `).get(empresaId).count > 0, 'records conflict batches as failed synchronization attempts');

  const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
  const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all().length;
  assert(integrity === 'ok' && foreignKeyViolations === 0, 'preserves SQLite and foreign-key integrity');
  db.close();
}
