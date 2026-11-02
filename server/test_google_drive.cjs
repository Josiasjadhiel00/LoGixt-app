const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (process.env.LOGIXT_GOOGLE_DRIVE_TEST_WORKER === '1') {
  runWorker().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logixt-google-drive-test-'));
  const dbPath = path.join(testDir, 'database.sqlite');
  const child = spawnSync(process.execPath, [__filename], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DB_PATH: dbPath,
      BACKUPS_DIR: path.join(testDir, 'backups'),
      NODE_ENV: 'test',
      CLIENT_URL: 'http://localhost:5173',
      GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:5000/api/storage/google-drive/callback',
      GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 0x42).toString('hex'),
      LOGIXT_GOOGLE_DRIVE_TEST_WORKER: '1'
    },
    timeout: 30000
  });

  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  fs.rmSync(testDir, { recursive: true, force: true });
  process.exitCode = child.status === 0 ? 0 : (child.status || 1);
}

async function runWorker() {
  const crypto = require('node:crypto');
  const { default: db } = await import('./src/db/connection.js');
  const {
    connectGoogleDrive,
    disconnectGoogleDrive,
    getGoogleDriveBackups,
    getGoogleDriveStatus,
    googleDriveOAuthCallback,
    restoreGoogleDriveBackup,
    uploadBackupToGoogleDrive
  } = await import('./src/controllers/storageController.js');
  const {
    DRIVE_SCOPE,
    decryptGoogleDriveSecret,
    getGoogleDriveApiUrl,
    getGoogleDriveUploadUrl
  } = await import('./src/services/googleDriveService.js');
  const { Readable } = require('node:stream');

  const assert = (condition, message) => {
    if (!condition) throw new Error(`FAIL: ${message}`);
    console.log(`PASS: ${message}`);
  };
  const makeResponse = () => ({
    statusCode: 200,
    body: null,
    redirectUrl: null,
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
    redirect(url) { this.statusCode = 302; this.redirectUrl = url; return this; },
    send(body) { this.body = body; return this; }
  });
  const request = (user, extra = {}) => ({
    user,
    headers: {},
    params: {},
    query: {},
    body: {},
    ...extra
  });

  const planId = Number(db.prepare(`
    INSERT INTO planes (codigo, nombre, precio) VALUES ('DRIVE-TEST', 'Plan Drive test', 0)
  `).run().lastInsertRowid);
  const empresaId = Number(db.prepare(`
    INSERT INTO empresas (nombre, email, plan_id) VALUES ('Empresa Drive test', 'drive-test@example.invalid', ?)
  `).run(planId).lastInsertRowid);
  const adminUserId = Number(db.prepare(`
    INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol, empresa_id)
    VALUES ('Administrador Drive test', 'drive-test-admin', 'not-used', 'ADMINISTRADOR', ?)
  `).run(empresaId).lastInsertRowid);
  const workerUserId = Number(db.prepare(`
    INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol, empresa_id)
    VALUES ('Almacenero Drive test', 'drive-test-worker', 'not-used', 'ALMACENERO', ?)
  `).run(empresaId).lastInsertRowid);
  const admin = {
    id: adminUserId,
    nombre: 'Administrador Drive test',
    empresa_id: empresaId,
    empresa_nombre: 'Empresa Drive test',
    rol: 'ADMINISTRADOR'
  };

  const driveDir = path.join(path.dirname(process.env.DB_PATH), 'backup-files');
  fs.mkdirSync(driveDir, { recursive: true });
  const backupContent = Buffer.from(JSON.stringify({
    version: '2.0.0',
    tipo: 'TENANT_SNAPSHOT',
    empresa_id: empresaId,
    counts: { categorias: 0, productos: 0, movimientos: 0, dispositivos: 0 },
    data: { productos: [], movimientos: [], categorias: [] }
  }));
  let driveContent = backupContent;
  const backupPath = path.join(driveDir, 'backup-test.json');
  fs.writeFileSync(backupPath, backupContent);
  const checksum = crypto.createHash('sha256').update(backupContent).digest('hex');
  const backupId = Number(db.prepare(`
    INSERT INTO respaldos (
      empresa_id, usuario_id, tipo, nombre_archivo, ruta_archivo, tamano_bytes,
      checksum_sha256, total_productos, total_movimientos, total_categorias, estado
    ) VALUES (?, ?, 'MANUAL', 'backup-test.json', ?, ?, ?, 0, 0, 0, 'COMPLETADO')
  `).run(empresaId, adminUserId, backupPath, backupContent.length, checksum).lastInsertRowid);

  const statusResponse = makeResponse();
  getGoogleDriveStatus(request(admin), statusResponse);
  assert(statusResponse.body.configured === true && statusResponse.body.connected === false, 'reports configured Drive without exposing a connection');

  const originalSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const missingConfigResponse = makeResponse();
  getGoogleDriveStatus(request(admin), missingConfigResponse);
  assert(
    missingConfigResponse.body.configured === false &&
      missingConfigResponse.body.missingConfiguration.includes('GOOGLE_OAUTH_CLIENT_SECRET'),
    'reports missing OAuth environment configuration'
  );
  const unavailableConnectResponse = makeResponse();
  connectGoogleDrive(request(admin), unavailableConnectResponse);
  assert(unavailableConnectResponse.statusCode === 503, 'refuses OAuth when server configuration is incomplete');
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = originalSecret;

  const workerConnectResponse = makeResponse();
  connectGoogleDrive(request({
    id: workerUserId,
    empresa_id: empresaId,
    rol: 'ALMACENERO'
  }), workerConnectResponse);
  assert(workerConnectResponse.statusCode === 403, 'restricts Drive connection management to administrators');

  const connectResponse = makeResponse();
  connectGoogleDrive(request(admin), connectResponse);
  const authorizationUrl = new URL(connectResponse.body.authorizationUrl);
  const state = authorizationUrl.searchParams.get('state');
  const challenge = authorizationUrl.searchParams.get('code_challenge');
  const stateRow = db.prepare('SELECT * FROM google_drive_oauth_states').get();
  assert(
    authorizationUrl.searchParams.get('scope') === DRIVE_SCOPE &&
      authorizationUrl.searchParams.get('code_challenge_method') === 'S256' &&
      authorizationUrl.searchParams.get('include_granted_scopes') === 'false',
    'requests only the Drive file scope and uses PKCE'
  );
  assert(
    new URL(getGoogleDriveApiUrl('/files')).pathname === '/drive/v3/files' &&
      new URL(getGoogleDriveUploadUrl('/files')).pathname === '/upload/drive/v3/files',
    'targets the Drive API and upload API paths correctly'
  );
  assert(state && stateRow.state_hash !== state && !stateRow.code_verifier_encrypted.includes(state), 'stores only a hash of OAuth state and encrypts the PKCE verifier');

  let uploadedFile = null;
  let uploadCalls = 0;
  let tokenCodeVerifier = null;
  global.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
      const body = new URLSearchParams(options.body);
      if (body.get('grant_type') === 'authorization_code') {
        tokenCodeVerifier = body.get('code_verifier');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            expires_in: 3600,
            scope: DRIVE_SCOPE
          })
        };
      }
      if (body.get('grant_type') === 'refresh_token') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'test-refreshed-access-token',
            expires_in: 3600
          })
        };
      }
    }

    if (url.hostname === 'www.googleapis.com' && url.pathname === '/drive/v3/files' && options.method !== 'POST') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          files: uploadedFile ? [uploadedFile] : [],
          ...(url.searchParams.has('pageToken') ? {} : { nextPageToken: uploadedFile ? 'drive-page-2' : undefined })
        })
      };
    }

    if (url.hostname === 'www.googleapis.com' &&
        url.pathname === '/drive/v3/files/drive-file-test' &&
        url.searchParams.get('alt') === 'media') {
      return {
        ok: true,
        status: 200,
        body: Readable.toWeb(Readable.from([driveContent]))
      };
    }

    if (url.hostname === 'www.googleapis.com' && url.pathname === '/drive/v3/files/drive-file-test') {
      return { ok: true, status: 200, json: async () => uploadedFile };
    }

    if (url.hostname === 'www.googleapis.com' && url.pathname === '/upload/drive/v3/files') {
      uploadCalls += 1;
      const bodyChunks = [];
      for await (const chunk of options.body) bodyChunks.push(Buffer.from(chunk));
      const multipartBody = Buffer.concat(bodyChunks);
      assert(multipartBody.includes(Buffer.from(backupContent)), 'streams the validated backup file bytes in the upload');
      uploadedFile = {
        id: 'drive-file-test',
        name: 'LOGIXT-test-backup.json',
        webViewLink: 'https://drive.google.test/file/d/drive-file-test',
        appProperties: {
          logixt_company_id: String(empresaId),
          logixt_backup_id: String(backupId),
          logixt_checksum_sha256: checksum
        },
        size: String(backupContent.length),
        createdTime: new Date().toISOString()
      };
      return { ok: true, status: 200, json: async () => uploadedFile };
    }

    if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/revoke') {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    throw new Error(`Unexpected mocked Google request ${url.pathname}`);
  };

  const callbackResponse = makeResponse();
  await googleDriveOAuthCallback(request(null, {
    query: { state, code: 'test-authorization-code' }
  }), callbackResponse);
  assert(new URL(callbackResponse.redirectUrl).searchParams.get('googleDrive') === 'connected', 'completes OAuth and redirects to the configured client');
  assert(
    crypto.createHash('sha256').update(tokenCodeVerifier).digest('base64url') === challenge,
    'uses the matching PKCE verifier during code exchange'
  );

  const storedConnection = db.prepare('SELECT * FROM google_drive_connections WHERE empresa_id = ?').get(empresaId);
  assert(
    !storedConnection.access_token_encrypted.includes('test-access-token') &&
      !storedConnection.refresh_token_encrypted.includes('test-refresh-token'),
    'persists access and refresh tokens only in encrypted form'
  );
  let crossTenantDecryptRejected = false;
  try {
    decryptGoogleDriveSecret(storedConnection.refresh_token_encrypted, `refresh-token:${empresaId + 1}`);
  } catch {
    crossTenantDecryptRejected = true;
  }
  assert(crossTenantDecryptRejected, 'binds encrypted credentials to their company context');
  const connectedStatus = makeResponse();
  getGoogleDriveStatus(request(admin), connectedStatus);
  assert(connectedStatus.body.connected === true, 'reports the company Drive connection after OAuth');

  const secondConnectResponse = makeResponse();
  connectGoogleDrive(request(admin), secondConnectResponse);
  const secondState = new URL(secondConnectResponse.body.authorizationUrl).searchParams.get('state');
  db.prepare("UPDATE usuarios SET rol = 'ALMACENERO' WHERE id = ?").run(adminUserId);
  const revokedPermissionResponse = makeResponse();
  await googleDriveOAuthCallback(request(null, {
    query: { state: secondState, code: 'not-exchanged' }
  }), revokedPermissionResponse);
  assert(
    new URL(revokedPermissionResponse.redirectUrl).searchParams.get('googleDrive') === 'unauthorized',
    'revalidates administrator and company status when OAuth returns'
  );
  db.prepare("UPDATE usuarios SET rol = 'ADMINISTRADOR' WHERE id = ?").run(adminUserId);

  db.prepare(`
    INSERT INTO google_drive_backup_uploads (
      empresa_id, backup_id, checksum_sha256, usuario_id, fecha_subida, estado
    ) VALUES (?, ?, ?, ?, ?, 'SUBIENDO')
  `).run(empresaId, backupId, checksum, adminUserId, new Date().toISOString());
  const busyUploadResponse = makeResponse();
  await uploadBackupToGoogleDrive(request(admin, { params: { id: String(backupId) } }), busyUploadResponse);
  assert(busyUploadResponse.statusCode === 409, 'prevents simultaneous uploads of the same company backup');
  db.prepare('DELETE FROM google_drive_backup_uploads WHERE empresa_id = ? AND backup_id = ?')
    .run(empresaId, backupId);

  db.prepare('UPDATE google_drive_connections SET expires_at = ? WHERE empresa_id = ?')
    .run(new Date(Date.now() - 1000).toISOString(), empresaId);

  const uploadResponse = makeResponse();
  await uploadBackupToGoogleDrive(request(admin, { params: { id: String(backupId) } }), uploadResponse);
  assert(uploadResponse.statusCode === 200 && uploadResponse.body.file.id === 'drive-file-test', 'uploads a checksum-verified tenant backup');
  assert(uploadCalls === 1, 'creates the Drive file once');
  assert(
    db.prepare('SELECT COUNT(*) AS count FROM google_drive_backup_uploads WHERE empresa_id = ?').get(empresaId).count === 1,
    'records the successful Drive upload for the tenant'
  );
  assert(
    !db.prepare('SELECT access_token_encrypted FROM google_drive_connections WHERE empresa_id = ?').get(empresaId)
      .access_token_encrypted.includes('test-refreshed-access-token'),
    'refreshes expired access tokens and stores the replacement encrypted'
  );

  const driveListResponse = makeResponse();
  await getGoogleDriveBackups(request(admin), driveListResponse);
  assert(
    driveListResponse.statusCode === 200 &&
      driveListResponse.body.backups[0].id === 'drive-file-test' &&
      driveListResponse.body.nextPageToken === 'drive-page-2',
    'lists only company-tagged LOGIXT backups and returns pagination'
  );
  const driveNextPageResponse = makeResponse();
  await getGoogleDriveBackups(request(admin, { query: { pageToken: 'drive-page-2' } }), driveNextPageResponse);
  assert(driveNextPageResponse.statusCode === 200, 'accepts Drive pagination tokens');

  uploadedFile.appProperties.logixt_company_id = String(empresaId + 1);
  const crossTenantRestoreResponse = makeResponse();
  await restoreGoogleDriveBackup(request(admin, { params: { fileId: 'drive-file-test' } }), crossTenantRestoreResponse);
  assert(crossTenantRestoreResponse.statusCode === 404, 'refuses a Drive backup tagged for another tenant');
  uploadedFile.appProperties.logixt_company_id = String(empresaId);

  uploadedFile.appProperties.logixt_checksum_sha256 = '0'.repeat(64);
  const checksumRestoreResponse = makeResponse();
  await restoreGoogleDriveBackup(request(admin, { params: { fileId: 'drive-file-test' } }), checksumRestoreResponse);
  assert(checksumRestoreResponse.statusCode === 409, 'rejects corrupted Drive backup bytes before restoration');
  uploadedFile.appProperties.logixt_checksum_sha256 = checksum;

  driveContent = Buffer.from(JSON.stringify({
    version: '2.0.0',
    tipo: 'TENANT_SNAPSHOT',
    empresa_id: empresaId + 1,
    counts: { categorias: 0, productos: 0, movimientos: 0, dispositivos: 0 },
    data: { productos: [], movimientos: [], categorias: [] }
  }));
  uploadedFile.appProperties.logixt_checksum_sha256 = crypto.createHash('sha256').update(driveContent).digest('hex');
  const invalidTenantSnapshotResponse = makeResponse();
  await restoreGoogleDriveBackup(request(admin, { params: { fileId: 'drive-file-test' } }), invalidTenantSnapshotResponse);
  assert(invalidTenantSnapshotResponse.statusCode === 400, 'rejects a validly checksummed snapshot belonging to a different tenant');
  driveContent = backupContent;
  uploadedFile.appProperties.logixt_checksum_sha256 = checksum;

  const restoreResponse = makeResponse();
  await restoreGoogleDriveBackup(request(admin, { params: { fileId: 'drive-file-test' } }), restoreResponse);
  assert(
    restoreResponse.statusCode === 200 &&
      restoreResponse.body.restoredCounts.productos === 0 &&
      restoreResponse.body.preventiveBackupId,
    'restores a validated Drive snapshot and creates a preventive server backup'
  );
  assert(
    db.prepare("SELECT COUNT(*) AS count FROM respaldos WHERE empresa_id = ? AND detalles LIKE 'Respaldo importado desde Google Drive%'")
      .get(empresaId).count === 1,
    'retains a local recovery copy of a restored Drive backup'
  );

  const duplicateUploadResponse = makeResponse();
  await uploadBackupToGoogleDrive(request(admin, { params: { id: String(backupId) } }), duplicateUploadResponse);
  assert(duplicateUploadResponse.body.alreadyUploaded === true && uploadCalls === 1, 'does not duplicate a backup already present in Drive');

  const tamperedBackupId = Number(db.prepare(`
    INSERT INTO respaldos (
      empresa_id, usuario_id, tipo, nombre_archivo, ruta_archivo, tamano_bytes,
      checksum_sha256, estado
    ) VALUES (?, ?, 'MANUAL', 'tampered.json', ?, ?, 'invalid-checksum', 'COMPLETADO')
  `).run(empresaId, adminUserId, backupPath, backupContent.length).lastInsertRowid);
  const tamperedResponse = makeResponse();
  await uploadBackupToGoogleDrive(request(admin, { params: { id: String(tamperedBackupId) } }), tamperedResponse);
  assert(tamperedResponse.statusCode === 409 && uploadCalls === 1, 'rejects a backup whose checksum does not match');

  const otherTenantUpload = makeResponse();
  await uploadBackupToGoogleDrive(request({
    id: adminUserId,
    empresa_id: empresaId + 999,
    rol: 'ADMINISTRADOR'
  }, { params: { id: String(backupId) } }), otherTenantUpload);
  assert(otherTenantUpload.statusCode === 404, 'prevents uploading a backup outside the active tenant');

  const reusedStateResponse = makeResponse();
  await googleDriveOAuthCallback(request(null, {
    query: { state, code: 'reused-code' }
  }), reusedStateResponse);
  assert(new URL(reusedStateResponse.redirectUrl).searchParams.get('googleDrive') === 'invalid_state', 'rejects reuse of an OAuth state');

  const disconnectResponse = makeResponse();
  await disconnectGoogleDrive(request(admin), disconnectResponse);
  assert(disconnectResponse.statusCode === 200, 'revokes Google authorization before disconnecting');
  assert(
    db.prepare('SELECT COUNT(*) AS count FROM google_drive_connections WHERE empresa_id = ?').get(empresaId).count === 0,
    'removes encrypted credentials after disconnect'
  );
}
