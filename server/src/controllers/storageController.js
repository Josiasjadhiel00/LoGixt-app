import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import db, { transaction } from '../db/connection.js';
import { logActivity } from '../utils/activityLogger.js';
import {
  DRIVE_SCOPE,
  GoogleDriveServiceError,
  createGoogleDriveAuthorizationUrl,
  decryptGoogleDriveSecret,
  encryptGoogleDriveSecret,
  exchangeGoogleDriveCode,
  getGoogleDriveApiUrl,
  getGoogleDriveConfiguration,
  getGoogleDriveUploadUrl,
  googleDriveApiRequest,
  refreshGoogleDriveAccessToken,
  revokeGoogleDriveToken
} from '../services/googleDriveService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio base de respaldos
const BACKUPS_ROOT = process.env.BACKUPS_DIR
  ? path.resolve(process.env.BACKUPS_DIR)
  : path.resolve(__dirname, '../../backups');
const TENANTS_BACKUPS_DIR = path.join(BACKUPS_ROOT, 'tenants');

// Asegurar que existan los directorios
if (!fs.existsSync(TENANTS_BACKUPS_DIR)) {
  fs.mkdirSync(TENANTS_BACKUPS_DIR, { recursive: true });
}

/**
 * Calcula el hash SHA-256 de una cadena o buffer
 */
function computeSha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Calcula la próxima fecha estimada de respaldo según frecuencia
 */
function calculateNextBackupDate(frecuencia) {
  const now = new Date();
  switch (frecuencia) {
    case 'HORARIA':
      now.setHours(now.getHours() + 1);
      break;
    case 'DIARIA':
      now.setDate(now.getDate() + 1);
      break;
    case 'SEMANAL':
      now.setDate(now.getDate() + 7);
      break;
    case 'TIEMPO_REAL':
      now.setMinutes(now.getMinutes() + 15);
      break;
    case 'MANUAL':
    default:
      return null;
  }
  return now.toISOString();
}

/**
 * Genera un snapshot estructurado de los datos de una empresa
 */
function generateTenantSnapshot(empresaId, usuarioId, dispositivoUuid) {
  const empresa = db.prepare('SELECT * FROM empresas WHERE id = ?').get(empresaId);
  if (!empresa) {
    throw new Error('Empresa no encontrada.');
  }

  const categorias = db.prepare('SELECT * FROM categorias WHERE empresa_id = ?').all(empresaId);
  const productos = db.prepare('SELECT * FROM productos WHERE empresa_id = ?').all(empresaId);
  const movimientos = db.prepare('SELECT * FROM movimientos WHERE empresa_id = ? ORDER BY id ASC').all(empresaId);
  const dispositivos = db.prepare('SELECT id, uuid, nombre, tipo, sistema_operativo, version_logixt, estado, fecha_registro FROM dispositivos WHERE empresa_id = ?').all(empresaId);

  const snapshot = {
    version: '2.0.0',
    system: 'LOGIXT SaaS WMS',
    tipo: 'TENANT_SNAPSHOT',
    empresa_id: empresaId,
    empresa_nombre: empresa.nombre,
    creado_por_usuario_id: usuarioId,
    dispositivo_uuid: dispositivoUuid || null,
    timestamp: new Date().toISOString(),
    counts: {
      categorias: categorias.length,
      productos: productos.length,
      movimientos: movimientos.length,
      dispositivos: dispositivos.length
    },
    data: {
      empresa,
      categorias,
      productos,
      movimientos,
      dispositivos
    }
  };

  return snapshot;
}

/**
 * Guarda físicamente un snapshot y lo registra en la base de datos
 */
function persistTenantBackup(snapshot, tipo = 'MANUAL', detalles = null) {
  const empresaId = snapshot.empresa_id;
  const usuarioId = snapshot.creado_por_usuario_id;
  const dispositivoUuid = snapshot.dispositivo_uuid;

  const empresaDir = path.join(TENANTS_BACKUPS_DIR, String(empresaId));
  if (!fs.existsSync(empresaDir)) {
    fs.mkdirSync(empresaDir, { recursive: true });
  }

  const jsonContent = JSON.stringify(snapshot, null, 2);
  const checksum = computeSha256(jsonContent);

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const prefix = tipo === 'PREVENTIVO' ? 'backup-prev' : tipo === 'AUTOMATICO' ? 'backup-auto' : 'backup-manual';
  const fileName = `${prefix}-empresa-${empresaId}-${dateStr}-${checksum.substring(0, 8)}.json`;
  const filePath = path.join(empresaDir, fileName);

  fs.writeFileSync(filePath, jsonContent, 'utf-8');

  const stats = fs.statSync(filePath);

  const stmt = db.prepare(`
    INSERT INTO respaldos (
      empresa_id, usuario_id, dispositivo_uuid, tipo, nombre_archivo,
      ruta_archivo, tamano_bytes, checksum_sha256, total_productos,
      total_movimientos, total_categorias, estado, detalles
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETADO', ?)
  `);

  const info = stmt.run(
    empresaId,
    usuarioId,
    dispositivoUuid,
    tipo,
    fileName,
    filePath,
    stats.size,
    checksum,
    snapshot.counts.productos,
    snapshot.counts.movimientos,
    snapshot.counts.categorias,
    detalles || `Respaldo ${tipo.toLowerCase()} generado exitosamente.`
  );

  // Registrar auditoría de sincronización
  db.prepare(`
    INSERT INTO sincronizacion_logs (
      empresa_id, usuario_id, dispositivo_uuid, tipo_operacion,
      entidad, registros_afectados, estado, detalles
    ) VALUES (?, ?, ?, 'SUBIDA', 'TODO', ?, 'EXITOSO', ?)
  `).run(
    empresaId,
    usuarioId,
    dispositivoUuid,
    snapshot.counts.productos + snapshot.counts.movimientos,
    `Respaldo ${tipo} creado: ${fileName} (${stats.size} bytes)`
  );

  return {
    id: info.lastInsertRowid,
    nombre_archivo: fileName,
    tamano_bytes: stats.size,
    checksum_sha256: checksum,
    total_productos: snapshot.counts.productos,
    total_movimientos: snapshot.counts.movimientos,
    total_categorias: snapshot.counts.categorias,
    tipo,
    fecha_creacion: now.toISOString()
  };
}

function getCompanyAdminContext(req, res) {
  if (!['ADMINISTRADOR', 'SUPERADMIN'].includes(req.user.rol)) {
    res.status(403).json({ error: 'Solo un administrador puede gestionar Google Drive.' });
    return null;
  }

  const empresaId = Number(req.user.empresa_id);
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0) {
    res.status(403).json({ error: 'Se requiere una empresa activa para gestionar Google Drive.' });
    return null;
  }

  return { empresaId, usuarioId: req.user.id };
}

function getGoogleDriveClientRedirect(result) {
  const clientUrl = process.env.CLIENT_URL?.trim();
  if (!clientUrl) return null;
  try {
    const redirect = new URL(clientUrl);
    redirect.searchParams.set('googleDrive', result);
    return redirect.toString();
  } catch {
    return null;
  }
}

function redirectGoogleDriveOAuthResult(res, result) {
  const redirectUrl = getGoogleDriveClientRedirect(result);
  if (!redirectUrl) {
    return res.status(500).send('No se pudo volver a la aplicación. Contacta al administrador del sistema.');
  }
  return res.redirect(redirectUrl);
}

function saveGoogleDriveUpload({ empresaId, backup, usuarioId, googleFile }) {
  db.prepare(`
    INSERT INTO google_drive_backup_uploads (
      empresa_id, backup_id, google_file_id, google_file_name, checksum_sha256, usuario_id, fecha_subida, estado
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'COMPLETADO')
    ON CONFLICT(empresa_id, backup_id) DO UPDATE SET
      google_file_id = excluded.google_file_id,
      google_file_name = excluded.google_file_name,
      checksum_sha256 = excluded.checksum_sha256,
      usuario_id = excluded.usuario_id,
      fecha_subida = CURRENT_TIMESTAMP,
      estado = 'COMPLETADO'
  `).run(
    empresaId,
    backup.id,
    googleFile.id,
    googleFile.name,
    backup.checksum_sha256,
    usuarioId
  );
}

async function getGoogleDriveAccessToken(empresaId, connection) {
  let refreshToken = decryptGoogleDriveSecret(
    connection.refresh_token_encrypted,
    `refresh-token:${empresaId}`
  );
  if (Date.parse(connection.expires_at) > Date.now() + 60_000) {
    return decryptGoogleDriveSecret(
      connection.access_token_encrypted,
      `access-token:${empresaId}`
    );
  }

  const refreshed = await refreshGoogleDriveAccessToken(refreshToken);
  if (!refreshed.access_token) {
    throw new GoogleDriveServiceError('Google no devolvió un token de acceso válido. Vuelve a conectar la cuenta.', 502);
  }
  refreshToken = refreshed.refresh_token || refreshToken;
  const expiresIn = Number(refreshed.expires_in);
  db.prepare(`
    UPDATE google_drive_connections
    SET access_token_encrypted = ?, refresh_token_encrypted = ?, expires_at = ?, fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE empresa_id = ?
  `).run(
    encryptGoogleDriveSecret(refreshed.access_token, `access-token:${empresaId}`),
    encryptGoogleDriveSecret(refreshToken, `refresh-token:${empresaId}`),
    new Date(Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000).toISOString(),
    empresaId
  );
  return refreshed.access_token;
}

// ========================================================
// CONTROLADORES PÚBLICOS DE ALMACENAMIENTO Y SINCRONIZACIÓN
// ========================================================

/**
 * GET /api/storage/google-drive/status
 * Informa configuración y estado sin revelar tokens o credenciales.
 */
export function getGoogleDriveStatus(req, res) {
  const config = getGoogleDriveConfiguration();
  const empresaId = Number(req.user.empresa_id);
  const connection = Number.isSafeInteger(empresaId) && empresaId > 0
    ? db.prepare(`
        SELECT fecha_conexion, fecha_actualizacion
        FROM google_drive_connections
        WHERE empresa_id = ?
      `).get(empresaId)
    : null;
  const uploadSummary = Number.isSafeInteger(empresaId) && empresaId > 0
    ? db.prepare(`
        SELECT COUNT(*) AS total, MAX(fecha_subida) AS ultimo_respaldo
        FROM google_drive_backup_uploads
      WHERE empresa_id = ? AND estado = 'COMPLETADO'
      `).get(empresaId)
    : { total: 0, ultimo_respaldo: null };

  return res.json({
    configured: config.configured,
    missingConfiguration: config.missing,
    connected: Boolean(connection),
    connectedAt: connection?.fecha_conexion || null,
    uploadedBackupCount: uploadSummary.total,
    lastUploadAt: uploadSummary.ultimo_respaldo || null
  });
}

/**
 * GET /api/storage/google-drive/backups
 * Lista copias creadas por LOGIXT para la empresa autenticada.
 */
export async function getGoogleDriveBackups(req, res) {
  const context = getCompanyAdminContext(req, res);
  if (!context) return;

  const connection = db.prepare(`
    SELECT * FROM google_drive_connections WHERE empresa_id = ?
  `).get(context.empresaId);
  if (!connection) {
    return res.status(409).json({ error: 'Conecta primero una cuenta de Google Drive para esta empresa.' });
  }

  const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : '';
  if (pageToken.length > 2048) {
    return res.status(400).json({ error: 'Token de paginación inválido.' });
  }

  try {
    const accessToken = await getGoogleDriveAccessToken(context.empresaId, connection);
    const query = `appProperties has { key='logixt_company_id' and value='${context.empresaId}' } and trashed = false`;
    const response = await googleDriveApiRequest(
      accessToken,
      getGoogleDriveApiUrl('/files', {
        q: query,
        orderBy: 'createdTime desc',
        pageSize: '100',
        fields: 'nextPageToken,files(id,name,size,createdTime,appProperties)',
        ...(pageToken ? { pageToken } : {})
      })
    );
    const result = await response.json();
    const backups = (result.files || [])
      .filter((file) =>
        file.appProperties?.logixt_company_id === String(context.empresaId) &&
        /^[\da-f]{64}$/i.test(file.appProperties?.logixt_checksum_sha256 || '')
      )
      .map((file) => ({
        id: file.id,
        name: file.name,
        sizeBytes: Number(file.size) || 0,
        createdAt: file.createdTime || null,
        checksumSha256: file.appProperties.logixt_checksum_sha256,
        sourceBackupId: file.appProperties.logixt_backup_id || null
      }));

    return res.json({
      backups,
      nextPageToken: typeof result.nextPageToken === 'string' ? result.nextPageToken : null
    });
  } catch (error) {
    console.error('Error al listar respaldos de Google Drive:', error.message);
    return res.status(error instanceof GoogleDriveServiceError ? error.status : 502).json({
      error: error instanceof GoogleDriveServiceError
        ? error.message
        : 'No se pudieron consultar los respaldos de Google Drive.'
    });
  }
}

/**
 * POST /api/storage/google-drive/connect
 * Inicia OAuth con state aleatorio, PKCE y expiración de diez minutos.
 */
export function connectGoogleDrive(req, res) {
  const context = getCompanyAdminContext(req, res);
  if (!context) return;

  const config = getGoogleDriveConfiguration();
  if (!config.configured) {
    return res.status(503).json({
      error: 'Google Drive no está configurado en el servidor.',
      missingConfiguration: config.missing
    });
  }

  const state = crypto.randomBytes(32).toString('base64url');
  const stateHash = computeSha256(state);
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  try {
    transaction(() => {
      db.prepare(`
        DELETE FROM google_drive_oauth_states
        WHERE expires_at <= ? OR (empresa_id = ? AND usuario_id = ?)
      `).run(new Date().toISOString(), context.empresaId, context.usuarioId);
      db.prepare(`
        INSERT INTO google_drive_oauth_states (
          state_hash, empresa_id, usuario_id, code_verifier_encrypted, expires_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        stateHash,
        context.empresaId,
        context.usuarioId,
        encryptGoogleDriveSecret(codeVerifier, `oauth-state:${stateHash}`),
        expiresAt
      );
    });
    const authorizationUrl = createGoogleDriveAuthorizationUrl(state, codeVerifier);
    return res.json({ authorizationUrl });
  } catch (error) {
    console.error('Error al iniciar OAuth de Google Drive:', error.message);
    return res.status(error instanceof GoogleDriveServiceError ? error.status : 500).json({
      error: error instanceof GoogleDriveServiceError
        ? error.message
        : 'No se pudo iniciar la conexión con Google Drive.'
    });
  }
}

/**
 * GET /api/storage/google-drive/callback
 * Completa OAuth solo si el state pendiente existe y aún no expiró.
 */
export async function googleDriveOAuthCallback(req, res) {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!state) return redirectGoogleDriveOAuthResult(res, 'invalid_state');

  const stateHash = computeSha256(state);
  let pendingState;
  try {
    pendingState = transaction(() => {
      const row = db.prepare(`
        SELECT * FROM google_drive_oauth_states WHERE state_hash = ?
      `).get(stateHash);
      if (row) {
        db.prepare('DELETE FROM google_drive_oauth_states WHERE state_hash = ?').run(stateHash);
      }
      return row;
    });
  } catch (error) {
    console.error('Error al validar state OAuth de Google Drive:', error.message);
    return redirectGoogleDriveOAuthResult(res, 'oauth_failed');
  }

  if (!pendingState || Date.parse(pendingState.expires_at) <= Date.now()) {
    return redirectGoogleDriveOAuthResult(res, 'invalid_state');
  }
  const initiator = db.prepare(`
    SELECT u.rol, u.estado AS usuario_estado, e.estado AS empresa_estado
    FROM usuarios u
    JOIN empresas e ON e.id = u.empresa_id
    WHERE u.id = ? AND e.id = ?
  `).get(pendingState.usuario_id, pendingState.empresa_id);
  if (!initiator ||
      !['ADMINISTRADOR', 'SUPERADMIN'].includes(initiator.rol) ||
      initiator.usuario_estado !== 'ACTIVO' ||
      initiator.empresa_estado !== 'ACTIVA') {
    return redirectGoogleDriveOAuthResult(res, 'unauthorized');
  }
  if (typeof req.query.error === 'string') {
    return redirectGoogleDriveOAuthResult(res, 'cancelled');
  }
  if (typeof req.query.code !== 'string' || !req.query.code) {
    return redirectGoogleDriveOAuthResult(res, 'oauth_failed');
  }

  try {
    const codeVerifier = decryptGoogleDriveSecret(
      pendingState.code_verifier_encrypted,
      `oauth-state:${stateHash}`
    );
    const tokenResponse = await exchangeGoogleDriveCode(req.query.code, codeVerifier);
    const grantedScopes = typeof tokenResponse.scope === 'string'
      ? tokenResponse.scope.split(/\s+/).filter(Boolean)
      : [DRIVE_SCOPE];
    if (!tokenResponse.access_token ||
        grantedScopes.length !== 1 ||
        !grantedScopes.includes(DRIVE_SCOPE)) {
      throw new GoogleDriveServiceError('Google no concedió el permiso mínimo requerido para Drive.', 400);
    }

    const previousConnection = db.prepare(`
      SELECT refresh_token_encrypted
      FROM google_drive_connections
      WHERE empresa_id = ?
    `).get(pendingState.empresa_id);
    const refreshToken = tokenResponse.refresh_token ||
      (previousConnection
        ? decryptGoogleDriveSecret(
            previousConnection.refresh_token_encrypted,
            `refresh-token:${pendingState.empresa_id}`
          )
        : null);
    if (!refreshToken) {
      throw new GoogleDriveServiceError('Google no entregó un refresh token. Vuelve a autorizar la conexión.', 400);
    }

    const expiresIn = Number(tokenResponse.expires_in);
    const expiresAt = new Date(Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000).toISOString();
    db.prepare(`
      INSERT INTO google_drive_connections (
        empresa_id, usuario_id, access_token_encrypted, refresh_token_encrypted,
        expires_at, scope, fecha_conexion, fecha_actualizacion
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(empresa_id) DO UPDATE SET
        usuario_id = excluded.usuario_id,
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        expires_at = excluded.expires_at,
        scope = excluded.scope,
        fecha_conexion = CURRENT_TIMESTAMP,
        fecha_actualizacion = CURRENT_TIMESTAMP
    `).run(
      pendingState.empresa_id,
      pendingState.usuario_id,
      encryptGoogleDriveSecret(tokenResponse.access_token, `access-token:${pendingState.empresa_id}`),
      encryptGoogleDriveSecret(refreshToken, `refresh-token:${pendingState.empresa_id}`),
      expiresAt,
      grantedScopes.join(' ')
    );

    return redirectGoogleDriveOAuthResult(res, 'connected');
  } catch (error) {
    console.error('Error al completar OAuth de Google Drive:', error.message);
    return redirectGoogleDriveOAuthResult(res, 'oauth_failed');
  }
}

/**
 * POST /api/storage/google-drive/disconnect
 * Revoca la credencial remota antes de eliminar los tokens locales.
 */
export async function disconnectGoogleDrive(req, res) {
  const context = getCompanyAdminContext(req, res);
  if (!context) return;

  const connection = db.prepare(`
    SELECT refresh_token_encrypted
    FROM google_drive_connections
    WHERE empresa_id = ?
  `).get(context.empresaId);
  if (!connection) return res.json({ message: 'La cuenta de Google Drive ya estaba desconectada.' });

  try {
    const refreshToken = decryptGoogleDriveSecret(
      connection.refresh_token_encrypted,
      `refresh-token:${context.empresaId}`
    );
    await revokeGoogleDriveToken(refreshToken);
    db.prepare('DELETE FROM google_drive_connections WHERE empresa_id = ?').run(context.empresaId);
    db.prepare('DELETE FROM google_drive_oauth_states WHERE empresa_id = ?').run(context.empresaId);
    return res.json({ message: 'La cuenta de Google Drive fue desconectada.' });
  } catch (error) {
    console.error('Error al desconectar Google Drive:', error.message);
    return res.status(error instanceof GoogleDriveServiceError ? error.status : 502).json({
      error: error instanceof GoogleDriveServiceError
        ? error.message
        : 'No se pudo desconectar Google Drive.'
    });
  }
}

/**
 * POST /api/storage/backup/:id/google-drive
 * Valida integridad y sube un respaldo concreto a la cuenta Drive de la empresa.
 */
export async function uploadBackupToGoogleDrive(req, res) {
  const context = getCompanyAdminContext(req, res);
  if (!context) return;

  const config = getGoogleDriveConfiguration();
  if (!config.configured) {
    return res.status(503).json({
      error: 'Google Drive no está configurado en el servidor.',
      missingConfiguration: config.missing
    });
  }

  const backupId = Number.parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(backupId) || backupId <= 0) {
    return res.status(400).json({ error: 'Identificador de respaldo inválido.' });
  }

  const backup = db.prepare(`
    SELECT * FROM respaldos WHERE id = ? AND empresa_id = ?
  `).get(backupId, context.empresaId);
  if (!backup) return res.status(404).json({ error: 'Respaldo no encontrado en la empresa activa.' });
  if (!fs.existsSync(backup.ruta_archivo)) {
    return res.status(404).json({ error: 'El archivo físico del respaldo no se encuentra en el servidor.' });
  }

  const connection = db.prepare(`
    SELECT * FROM google_drive_connections WHERE empresa_id = ?
  `).get(context.empresaId);
  if (!connection) {
    return res.status(409).json({ error: 'Conecta primero una cuenta de Google Drive para esta empresa.' });
  }

  let uploadReserved = false;
  let backupFileHandle;
  try {
    backupFileHandle = await fs.promises.open(backup.ruta_archivo, 'r');
    const fileHash = crypto.createHash('sha256');
    for await (const chunk of backupFileHandle.createReadStream({ autoClose: false, start: 0 })) {
      fileHash.update(chunk);
    }
    if (fileHash.digest('hex') !== backup.checksum_sha256) {
      return res.status(409).json({ error: 'El checksum del archivo no coincide; no se subió el respaldo.' });
    }

    const accessToken = await getGoogleDriveAccessToken(context.empresaId, connection);

    const uploadReservedNow = transaction(() => {
      const activeUpload = db.prepare(`
        SELECT estado, fecha_subida
        FROM google_drive_backup_uploads
        WHERE empresa_id = ? AND backup_id = ?
      `).get(context.empresaId, backup.id);
      if (activeUpload?.estado === 'SUBIENDO' &&
          Date.parse(activeUpload.fecha_subida) > Date.now() - 10 * 60 * 1000) {
        return false;
      }

      db.prepare(`
        INSERT INTO google_drive_backup_uploads (
          empresa_id, backup_id, checksum_sha256, usuario_id, fecha_subida, estado
        ) VALUES (?, ?, ?, ?, ?, 'SUBIENDO')
        ON CONFLICT(empresa_id, backup_id) DO UPDATE SET
          google_file_id = NULL,
          google_file_name = NULL,
          checksum_sha256 = excluded.checksum_sha256,
          usuario_id = excluded.usuario_id,
          fecha_subida = excluded.fecha_subida,
          estado = 'SUBIENDO'
      `).run(
        context.empresaId,
        backup.id,
        backup.checksum_sha256,
        context.usuarioId,
        new Date().toISOString()
      );
      return true;
    });
    if (!uploadReservedNow) {
      return res.status(409).json({ error: 'Este respaldo ya se está subiendo a Google Drive. Inténtalo de nuevo en unos minutos.' });
    }
    uploadReserved = true;

    const query = `appProperties has { key='logixt_company_id' and value='${context.empresaId}' } and appProperties has { key='logixt_backup_id' and value='${backup.id}' } and trashed = false`;
    const existingResponse = await googleDriveApiRequest(
      accessToken,
      getGoogleDriveApiUrl('/files', {
        q: query,
        pageSize: '1',
        fields: 'files(id,name,webViewLink)'
      })
    );
    const existingData = await existingResponse.json();
    let googleFile = existingData.files?.[0];
    let alreadyUploaded = Boolean(googleFile);

    if (!googleFile) {
      const boundary = `logixt_${crypto.randomBytes(16).toString('hex')}`;
      const fileName = `LOGIXT-${context.empresaId}-${backup.nombre_archivo}`;
      const metadata = {
        name: fileName,
        mimeType: 'application/json',
        appProperties: {
          logixt_company_id: String(context.empresaId),
          logixt_backup_id: String(backup.id),
          logixt_checksum_sha256: backup.checksum_sha256
        }
      };
      const metadataPart = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n`
      );
      const closingBoundary = Buffer.from(`\r\n--${boundary}--\r\n`);
      const fileStream = backupFileHandle.createReadStream({ autoClose: false, start: 0 });
      const multipartBody = Readable.from((async function* () {
        yield metadataPart;
        for await (const chunk of fileStream) yield chunk;
        yield closingBoundary;
      })());
      const uploadResponse = await googleDriveApiRequest(
        accessToken,
        getGoogleDriveUploadUrl('/files', { uploadType: 'multipart', fields: 'id,name,webViewLink' }),
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipartBody,
          duplex: 'half'
        }
      );
      googleFile = await uploadResponse.json();
      if (!googleFile.id || !googleFile.name) {
        throw new GoogleDriveServiceError('Google Drive no confirmó el archivo subido.', 502);
      }
    }

    saveGoogleDriveUpload({
      empresaId: context.empresaId,
      backup,
      usuarioId: context.usuarioId,
      googleFile
    });
    if (!alreadyUploaded) {
      db.prepare(`
        INSERT INTO sincronizacion_logs (
          empresa_id, usuario_id, tipo_operacion, entidad,
          registros_afectados, estado, detalles
        ) VALUES (?, ?, 'SUBIDA', 'RESPALDO_GOOGLE_DRIVE', 1, 'EXITOSO', ?)
      `).run(context.empresaId, context.usuarioId, `Respaldo ${backup.id} subido a Google Drive.`);
    }

    return res.json({
      message: alreadyUploaded ? 'Este respaldo ya estaba en Google Drive.' : 'Respaldo subido a Google Drive.',
      alreadyUploaded,
      file: {
        id: googleFile.id,
        name: googleFile.name,
        webViewLink: googleFile.webViewLink || null
      }
    });
  } catch (error) {
    if (uploadReserved) {
      db.prepare(`
        DELETE FROM google_drive_backup_uploads
        WHERE empresa_id = ? AND backup_id = ? AND estado = 'SUBIENDO'
      `).run(context.empresaId, backupId);
    }
    console.error(`Error al subir respaldo ${backupId} a Google Drive:`, error.message);
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'El archivo físico del respaldo no se encuentra en el servidor.' });
    }
    return res.status(error instanceof GoogleDriveServiceError ? error.status : 502).json({
      error: error instanceof GoogleDriveServiceError
        ? error.message
        : 'No se pudo subir el respaldo a Google Drive.'
    });
  } finally {
    if (backupFileHandle) {
      try {
        await backupFileHandle.close();
      } catch (error) {
        console.error(`No se pudo cerrar el archivo del respaldo ${backupId}:`, error.message);
      }
    }
  }
}

/**
 * POST /api/storage/google-drive/backups/:fileId/restore
 * Descarga, valida y restaura un respaldo creado por LOGIXT en Drive.
 */
export async function restoreGoogleDriveBackup(req, res) {
  const context = getCompanyAdminContext(req, res);
  if (!context) return;

  const fileId = req.params.fileId;
  if (typeof fileId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(fileId)) {
    return res.status(400).json({ error: 'Identificador de archivo de Google Drive inválido.' });
  }

  const connection = db.prepare(`
    SELECT * FROM google_drive_connections WHERE empresa_id = ?
  `).get(context.empresaId);
  if (!connection) {
    return res.status(409).json({ error: 'Conecta primero una cuenta de Google Drive para esta empresa.' });
  }

  const tenantBackupDir = path.join(TENANTS_BACKUPS_DIR, String(context.empresaId));
  const temporaryPath = path.join(tenantBackupDir, `.drive-restore-${crypto.randomUUID()}.tmp`);
  let stagedPath = null;
  let keepStagedFile = false;
  try {
    const accessToken = await getGoogleDriveAccessToken(context.empresaId, connection);
    const metadataResponse = await googleDriveApiRequest(
      accessToken,
      getGoogleDriveApiUrl(`/files/${encodeURIComponent(fileId)}`, {
        fields: 'id,name,size,appProperties'
      })
    );
    const metadata = await metadataResponse.json();
    if (metadata.id !== fileId ||
        metadata.appProperties?.logixt_company_id !== String(context.empresaId) ||
        !/^[\da-f]{64}$/i.test(metadata.appProperties?.logixt_checksum_sha256 || '')) {
      return res.status(404).json({ error: 'El archivo no es un respaldo LOGIXT válido de la empresa activa.' });
    }

    const contentResponse = await googleDriveApiRequest(
      accessToken,
      getGoogleDriveApiUrl(`/files/${encodeURIComponent(fileId)}`, { alt: 'media' })
    );
    if (!contentResponse.body) {
      throw new GoogleDriveServiceError('Google Drive devolvió un respaldo vacío.', 502);
    }

    const digest = crypto.createHash('sha256');
    const hashStream = new Transform({
      transform(chunk, encoding, callback) {
        digest.update(chunk);
        callback(null, chunk);
      }
    });
    await fs.promises.mkdir(tenantBackupDir, { recursive: true });
    await pipeline(
      Readable.fromWeb(contentResponse.body),
      hashStream,
      fs.createWriteStream(temporaryPath, { flags: 'wx' })
    );
    if (digest.digest('hex') !== metadata.appProperties.logixt_checksum_sha256) {
      return res.status(409).json({ error: 'El checksum del archivo de Google Drive no coincide; no se restauró.' });
    }

    let snapshot;
    try {
      snapshot = JSON.parse(await fs.promises.readFile(temporaryPath, 'utf8'));
    } catch {
      return res.status(400).json({ error: 'El archivo de Google Drive no contiene un snapshot JSON válido.' });
    }
    if (
      !snapshot?.data ||
      snapshot.empresa_id !== context.empresaId ||
      !Array.isArray(snapshot.data.categorias) ||
      !Array.isArray(snapshot.data.productos) ||
      !Array.isArray(snapshot.data.movimientos) ||
      !snapshot.counts ||
      !Number.isSafeInteger(snapshot.counts.categorias) ||
      !Number.isSafeInteger(snapshot.counts.productos) ||
      !Number.isSafeInteger(snapshot.counts.movimientos) ||
      snapshot.counts.categorias !== snapshot.data.categorias.length ||
      snapshot.counts.productos !== snapshot.data.productos.length ||
      snapshot.counts.movimientos !== snapshot.data.movimientos.length
    ) {
      return res.status(400).json({ error: 'El snapshot no corresponde a la empresa activa o su estructura no es válida.' });
    }

    const checksum = metadata.appProperties.logixt_checksum_sha256;
    const safeName = `backup-drive-${context.empresaId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`;
    stagedPath = path.join(tenantBackupDir, safeName);
    await fs.promises.rename(temporaryPath, stagedPath);
    const fileStats = await fs.promises.stat(stagedPath);
    const backupRecord = db.prepare(`
      INSERT INTO respaldos (
        empresa_id, usuario_id, tipo, nombre_archivo, ruta_archivo, tamano_bytes,
        checksum_sha256, total_productos, total_movimientos, total_categorias, estado, detalles
      ) VALUES (?, ?, 'MANUAL', ?, ?, ?, ?, ?, ?, ?, 'COMPLETADO', ?)
    `).run(
      context.empresaId,
      context.usuarioId,
      safeName,
      stagedPath,
      fileStats.size,
      checksum,
      snapshot.data.productos.length,
      snapshot.data.movimientos.length,
      snapshot.data.categorias.length,
      `Respaldo importado desde Google Drive (${String(metadata.name || 'archivo').slice(0, 180)}).`
    );
    keepStagedFile = true;

    const restoreRequest = {
      ...req,
      params: { ...req.params, id: String(backupRecord.lastInsertRowid) }
    };
    return restoreBackup(restoreRequest, res);
  } catch (error) {
    console.error('Error al restaurar respaldo de Google Drive:', error.message);
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'No se encontró el archivo descargado para restaurar.' });
    }
    return res.status(error instanceof GoogleDriveServiceError ? error.status : 502).json({
      error: error instanceof GoogleDriveServiceError
        ? error.message
        : 'No se pudo restaurar el respaldo de Google Drive.'
    });
  } finally {
    for (const filePath of [temporaryPath, keepStagedFile ? null : stagedPath]) {
      if (!filePath) continue;
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error('No se pudo limpiar un archivo temporal de restauración:', error.message);
        }
      }
    }
  }
}

/**
 * GET /api/storage/config
 * Obtiene la configuración actual de almacenamiento para el usuario/dispositivo
 */
export function getConfig(req, res) {
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;
  const dispositivoUuid = req.headers['x-device-uuid'] || req.query.dispositivo_uuid || 'DEFAULT_DEVICE';

  const config = db.prepare(`
    SELECT * FROM configuracion_almacenamiento
    WHERE usuario_id = ? AND dispositivo_uuid = ?
  `).get(usuarioId, dispositivoUuid);

  // Estadísticas globales de respaldo para la empresa
  let stats = null;
  if (empresaId) {
    stats = db.prepare(`
      SELECT 
        COUNT(id) AS total_respaldos,
        COALESCE(SUM(tamano_bytes), 0) AS total_bytes_respaldos,
        MAX(fecha_creacion) AS ultimo_respaldo_global
      FROM respaldos
      WHERE empresa_id = ?
    `).get(empresaId);
  }

  const counts = empresaId ? db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM productos WHERE empresa_id = ?) AS productos,
      (SELECT COUNT(*) FROM movimientos WHERE empresa_id = ?) AS movimientos,
      (SELECT COUNT(*) FROM categorias WHERE empresa_id = ?) AS categorias
  `).get(empresaId, empresaId, empresaId) : { productos: 0, movimientos: 0, categorias: 0 };

  return res.json({
    configurado: Boolean(config),
    config: config ? {
      ...config,
      auto_sincronizar: Boolean(config.auto_sincronizar),
      cifrado_activo: Boolean(config.cifrado_activo)
    } : {
      modo: req.user.almacenamiento_modo || 'LOCAL_SYNC',
      tipo_almacenamiento_local: 'INDEXEDDB',
      nombre_carpeta_local: null,
      auto_sincronizar: true,
      frecuencia_respaldo: 'DIARIA',
      cifrado_activo: true,
      estado_sincronizacion: 'PENDIENTE',
      ultimo_respaldo: null,
      proximo_respaldo: null
    },
    resumen_empresa: {
      total_respaldos: stats?.total_respaldos || 0,
      total_bytes_respaldos: stats?.total_bytes_respaldos || 0,
      ultimo_respaldo_global: stats?.ultimo_respaldo_global || null,
      inventario: counts
    }
  });
}

/**
 * POST /api/storage/config
 * Guarda la configuración de almacenamiento y ejecuta el respaldo inicial
 */
export function saveConfig(req, res) {
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;
  const {
    dispositivo_uuid,
    modo,
    tipo_almacenamiento_local,
    nombre_carpeta_local,
    ruta_local_referencia,
    auto_sincronizar,
    frecuencia_respaldo,
    cifrado_activo,
    bytes_utilizados_local
  } = req.body;

  const deviceUuid = dispositivo_uuid || req.headers['x-device-uuid'] || 'DEFAULT_DEVICE';
  const targetMode = modo === 'CLOUD_MANAGED' ? 'CLOUD_MANAGED' : 'LOCAL_SYNC';
  const targetType = ['DIRECTORIO_LOCAL', 'OPFS', 'INDEXEDDB'].includes(tipo_almacenamiento_local)
    ? tipo_almacenamiento_local
    : 'INDEXEDDB';
  const targetFrecuencia = ['MANUAL', 'HORARIA', 'DIARIA', 'SEMANAL', 'TIEMPO_REAL'].includes(frecuencia_respaldo)
    ? frecuencia_respaldo
    : 'DIARIA';

  const proximoRespaldo = calculateNextBackupDate(targetFrecuencia);

  transaction((dbSync) => {
    // 1. Guardar o actualizar configuración
    dbSync.prepare(`
      INSERT INTO configuracion_almacenamiento (
        usuario_id, empresa_id, dispositivo_uuid, modo,
        tipo_almacenamiento_local, nombre_carpeta_local, ruta_local_referencia,
        auto_sincronizar, frecuencia_respaldo, cifrado_activo,
        estado_sincronizacion, proximo_respaldo, bytes_utilizados_local,
        fecha_actualizacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SINCRONIZADO', ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(usuario_id, dispositivo_uuid) DO UPDATE SET
        modo = excluded.modo,
        tipo_almacenamiento_local = excluded.tipo_almacenamiento_local,
        nombre_carpeta_local = excluded.nombre_carpeta_local,
        ruta_local_referencia = excluded.ruta_local_referencia,
        auto_sincronizar = excluded.auto_sincronizar,
        frecuencia_respaldo = excluded.frecuencia_respaldo,
        cifrado_activo = excluded.cifrado_activo,
        estado_sincronizacion = 'SINCRONIZADO',
        proximo_respaldo = excluded.proximo_respaldo,
        bytes_utilizados_local = excluded.bytes_utilizados_local,
        fecha_actualizacion = CURRENT_TIMESTAMP
    `).run(
      usuarioId,
      empresaId,
      deviceUuid,
      targetMode,
      targetType,
      nombre_carpeta_local || null,
      ruta_local_referencia || null,
      auto_sincronizar !== false ? 1 : 0,
      targetFrecuencia,
      cifrado_activo !== false ? 1 : 0,
      proximoRespaldo,
      bytes_utilizados_local || 0
    );

    // 2. Marcar usuario como configurado
    dbSync.prepare(`
      UPDATE usuarios 
      SET almacenamiento_configurado = 1, almacenamiento_modo = ?
      WHERE id = ?
    `).run(targetMode, usuarioId);
  });

  // 3. Crear respaldo inicial automático si la empresa tiene datos o no tiene respaldos
  let initialBackup = null;
  if (empresaId) {
    try {
      const existingBackups = db.prepare('SELECT COUNT(*) as count FROM respaldos WHERE empresa_id = ?').get(empresaId);
      if (existingBackups.count === 0) {
        const snapshot = generateTenantSnapshot(empresaId, usuarioId, deviceUuid);
        initialBackup = persistTenantBackup(snapshot, 'AUTOMATICO', 'Respaldo inicial automático al configurar almacenamiento');
        
        // Actualizar último respaldo en configuración
        db.prepare(`
          UPDATE configuracion_almacenamiento 
          SET ultimo_respaldo = CURRENT_TIMESTAMP
          WHERE usuario_id = ? AND dispositivo_uuid = ?
        `).run(usuarioId, deviceUuid);
      }
    } catch (err) {
      console.warn('Aviso: no se pudo generar respaldo inicial:', err.message);
    }
  }

  logActivity({
    usuario_id: usuarioId,
    usuario_nombre: req.user.nombre,
    empresa_id: empresaId,
    empresa_nombre: req.user.empresa_nombre,
    accion: 'CONFIGURAR_ALMACENAMIENTO',
    detalles: `Modo: ${targetMode}, Motor local: ${targetType}, Carpeta: ${nombre_carpeta_local || 'N/A'}`
  });

  return res.json({
    message: 'Configuración de almacenamiento activada exitosamente.',
    modo: targetMode,
    tipo_almacenamiento_local: targetType,
    initialBackup
  });
}

/**
 * POST /api/storage/backup/create
 * Genera un respaldo manual o programado para la empresa autenticada
 */
export function createBackup(req, res) {
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;
  const { tipo = 'MANUAL', dispositivo_uuid, detalles } = req.body;

  if (!empresaId && req.user.rol !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Operación no permitida: Usuario sin empresa asociada.' });
  }

  try {
    const targetEmpresaId = req.body.empresa_id || empresaId;
    const deviceUuid = dispositivo_uuid || req.headers['x-device-uuid'] || 'WEB_CLIENT';

    const snapshot = generateTenantSnapshot(targetEmpresaId, usuarioId, deviceUuid);
    const backupRecord = persistTenantBackup(snapshot, tipo, detalles);

    // Actualizar fecha de último y próximo respaldo
    const nextDate = calculateNextBackupDate('DIARIA');
    db.prepare(`
      UPDATE configuracion_almacenamiento
      SET ultimo_respaldo = CURRENT_TIMESTAMP,
          proximo_respaldo = ?,
          estado_sincronizacion = 'SINCRONIZADO'
      WHERE empresa_id = ?
    `).run(nextDate, targetEmpresaId);

    logActivity({
      usuario_id: usuarioId,
      usuario_nombre: req.user.nombre,
      empresa_id: targetEmpresaId,
      empresa_nombre: req.user.empresa_nombre,
      accion: 'CREAR_RESPALDO',
      detalles: `Archivo: ${backupRecord.nombre_archivo}, Tamaño: ${(backupRecord.tamano_bytes / 1024).toFixed(1)} KB, Tipo: ${tipo}`
    });

    return res.json({
      message: 'Copia de seguridad generada y sincronizada exitosamente.',
      backup: backupRecord
    });
  } catch (err) {
    console.error('Error al generar respaldo:', err);
    return res.status(500).json({
      error: 'Error interno al generar el respaldo de seguridad.',
      details: err.message
    });
  }
}

/**
 * GET /api/storage/backups
 * Obtiene la lista de respaldos de la empresa autenticada
 */
export function getBackups(req, res) {
  const empresaId = req.user.empresa_id;
  const isSuperAdmin = req.user.rol === 'SUPERADMIN';

  let respaldos = [];
  if (isSuperAdmin && !empresaId) {
    respaldos = db.prepare(`
      SELECT r.*, e.nombre AS empresa_nombre, u.nombre AS usuario_nombre
      FROM respaldos r
      JOIN empresas e ON r.empresa_id = e.id
      JOIN usuarios u ON r.usuario_id = u.id
      ORDER BY r.fecha_creacion DESC
      LIMIT 100
    `).all();
  } else {
    respaldos = db.prepare(`
      SELECT r.*, u.nombre AS usuario_nombre
      FROM respaldos r
      JOIN usuarios u ON r.usuario_id = u.id
      WHERE r.empresa_id = ?
      ORDER BY r.fecha_creacion DESC
      LIMIT 100
    `).all(empresaId);
  }

  return res.json({ respaldos });
}

/**
 * GET /api/storage/backup/:id/download
 * Descarga el archivo de respaldo validando aislamiento multi-tenant
 */
export function downloadBackup(req, res) {
  const backupId = parseInt(req.params.id, 10);
  const empresaId = req.user.empresa_id;
  const isSuperAdmin = req.user.rol === 'SUPERADMIN';

  const backup = db.prepare('SELECT * FROM respaldos WHERE id = ?').get(backupId);
  if (!backup) {
    return res.status(404).json({ error: 'Copia de seguridad no encontrada.' });
  }

  // Validación de seguridad multi-tenant
  if (!isSuperAdmin && backup.empresa_id !== empresaId) {
    return res.status(403).json({ error: 'Acceso denegado: No tiene autorización para descargar este respaldo.' });
  }

  if (!fs.existsSync(backup.ruta_archivo)) {
    return res.status(404).json({ error: 'El archivo físico del respaldo no se encuentra en el servidor.' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${backup.nombre_archivo}"`);
  res.setHeader('Content-Type', 'application/json');
  return res.sendFile(backup.ruta_archivo);
}

/**
 * DELETE /api/storage/backup/:id
 * Elimina permanentemente un respaldo (registro y archivo físico)
 */
export function deleteBackup(req, res) {
  if (!['ADMINISTRADOR', 'SUPERADMIN'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'Solo un administrador puede eliminar respaldos.' });
  }

  const backupId = parseInt(req.params.id, 10);
  const empresaId = req.user.empresa_id;
  const isSuperAdmin = req.user.rol === 'SUPERADMIN';

  const backup = db.prepare('SELECT * FROM respaldos WHERE id = ?').get(backupId);
  if (!backup) {
    return res.status(404).json({ error: 'Respaldo no encontrado.' });
  }

  if (!isSuperAdmin && backup.empresa_id !== empresaId) {
    return res.status(403).json({ error: 'Acceso denegado a este respaldo.' });
  }

  try {
    if (fs.existsSync(backup.ruta_archivo)) {
      fs.unlinkSync(backup.ruta_archivo);
    }

    db.prepare('DELETE FROM respaldos WHERE id = ?').run(backupId);

    return res.json({
      ok: true,
      message: `Respaldo "${backup.nombre_archivo}" eliminado exitosamente.`
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al eliminar el respaldo.', details: error.message });
  }
}

/**
 * POST /api/storage/backup/:id/restore
 * Restaura una copia de seguridad creando previamente un respaldo preventivo
 */
export function restoreBackup(req, res) {
  if (!['ADMINISTRADOR', 'SUPERADMIN'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'Solo un administrador puede restaurar respaldos.' });
  }

  const backupId = parseInt(req.params.id, 10);
  const empresaId = req.user.empresa_id;
  const usuarioId = req.user.id;
  const isSuperAdmin = req.user.rol === 'SUPERADMIN';

  const backup = db.prepare('SELECT * FROM respaldos WHERE id = ?').get(backupId);
  if (!backup) {
    return res.status(404).json({ error: 'Respaldo no encontrado.' });
  }

  if (!isSuperAdmin && backup.empresa_id !== empresaId) {
    return res.status(403).json({ error: 'Acceso denegado a este respaldo.' });
  }

  if (!fs.existsSync(backup.ruta_archivo)) {
    return res.status(404).json({ error: 'El archivo físico del respaldo no está disponible.' });
  }

  try {
    const rawContent = fs.readFileSync(backup.ruta_archivo, 'utf-8');
    const calculatedChecksum = computeSha256(rawContent);

    // Validación criptográfica de integridad
    if (calculatedChecksum !== backup.checksum_sha256) {
      return res.status(400).json({
        error: 'Falla de integridad: El checksum del archivo no coincide con el registro original. La restauración fue cancelada por seguridad.'
      });
    }

    const snapshot = JSON.parse(rawContent);
    if (
      !snapshot.data ||
      !snapshot.empresa_id ||
      snapshot.empresa_id !== backup.empresa_id ||
      (!isSuperAdmin && snapshot.empresa_id !== empresaId) ||
      !Array.isArray(snapshot.data.categorias) ||
      !Array.isArray(snapshot.data.productos) ||
      !Array.isArray(snapshot.data.movimientos)
    ) {
      return res.status(400).json({ error: 'Formato de snapshot inválido o corrupto.' });
    }

    const targetEmpresaId = snapshot.empresa_id;

    // 1. Respaldo Preventivo de Seguridad antes de modificar
    const currentSnapshot = generateTenantSnapshot(targetEmpresaId, usuarioId, req.headers['x-device-uuid']);
    const preventiveBackup = persistTenantBackup(
      currentSnapshot,
      'PREVENTIVO',
      `Copia preventiva automática generada antes de restaurar respaldo #${backup.id} (${backup.nombre_archivo})`
    );

    // 2. Transacción Atómica de Restauración Multi-Tenant
    transaction((dbSync) => {
      const { categorias = [], productos = [], movimientos = [] } = snapshot.data;

      // Desactivar temporalmente foreign keys para reordenar tablas de forma segura
      dbSync.exec('PRAGMA foreign_keys = OFF;');

      // Limpiar datos existentes del tenant
      dbSync.prepare('DELETE FROM movimientos WHERE empresa_id = ?').run(targetEmpresaId);
      dbSync.prepare('DELETE FROM productos WHERE empresa_id = ?').run(targetEmpresaId);
      dbSync.prepare('DELETE FROM categorias WHERE empresa_id = ?').run(targetEmpresaId);

      // Restaurar Categorías
      const insertCat = dbSync.prepare(`
        INSERT INTO categorias (id, nombre, descripcion, prefijo, imagen, empresa_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const cat of categorias) {
        insertCat.run(cat.id, cat.nombre, cat.descripcion, cat.prefijo, cat.imagen, targetEmpresaId);
      }

      // Restaurar Productos
      const insertProd = dbSync.prepare(`
        INSERT INTO productos (
          id, codigo, codigo_barras, codigo_qr, nombre, categoria_id, descripcion,
          unidad_medida, stock_actual, stock_minimo, ubicacion_almacen, ubicacion_pasillo,
          ubicacion_estante, ubicacion_nivel, imagen, proveedor, empresa_id,
          fecha_creacion, fecha_actualizacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of productos) {
        insertProd.run(
          p.id, p.codigo, p.codigo_barras, p.codigo_qr, p.nombre, p.categoria_id, p.descripcion,
          p.unidad_medida || 'Unidades', p.stock_actual, p.stock_minimo, p.ubicacion_almacen,
          p.ubicacion_pasillo, p.ubicacion_estante, p.ubicacion_nivel, p.imagen, p.proveedor,
          targetEmpresaId, p.fecha_creacion, p.fecha_actualizacion
        );
      }

      // Restaurar Movimientos
      const insertMov = dbSync.prepare(`
        INSERT INTO movimientos (
          id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
          usuario_id, observacion, destino, motivo_ajuste, guia_despacho,
          responsable_recepcion, fecha, hora, empresa_id, fecha_creacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const m of movimientos) {
        insertMov.run(
          m.id, m.producto_id, m.tipo, m.cantidad, m.stock_anterior, m.stock_nuevo,
          m.usuario_id, m.observacion, m.destino, m.motivo_ajuste, m.guia_despacho,
          m.responsable_recepcion, m.fecha, m.hora, targetEmpresaId, m.fecha_creacion
        );
      }

      // Reactivar foreign keys
      dbSync.exec('PRAGMA foreign_keys = ON;');

      // Actualizar estado del respaldo a RESTAURADO
      dbSync.prepare("UPDATE respaldos SET estado = 'RESTAURADO' WHERE id = ?").run(backup.id);
    });

    // Registrar en auditoría
    db.prepare(`
      INSERT INTO sincronizacion_logs (
        empresa_id, usuario_id, dispositivo_uuid, tipo_operacion,
        entidad, registros_afectados, estado, detalles
      ) VALUES (?, ?, ?, 'RESTORE', 'TODO', ?, 'EXITOSO', ?)
    `).run(
      targetEmpresaId,
      usuarioId,
      req.headers['x-device-uuid'] || null,
      (snapshot.counts.productos || 0) + (snapshot.counts.movimientos || 0),
      `Restauración exitosa del respaldo #${backup.id} (${backup.nombre_archivo}). Respaldo preventivo guardado #${preventiveBackup.id}.`
    );

    logActivity({
      usuario_id: usuarioId,
      usuario_nombre: req.user.nombre,
      empresa_id: targetEmpresaId,
      empresa_nombre: req.user.empresa_nombre,
      accion: 'RESTAURAR_RESPALDO',
      detalles: `Respaldo restaurado ID: ${backup.id}. Se generó respaldo preventivo ID: ${preventiveBackup.id}.`
    });

    return res.json({
      message: 'Base de datos restaurada exitosamente.',
      preventiveBackupId: preventiveBackup.id,
      restoredCounts: snapshot.counts
    });
  } catch (err) {
    console.error('Error durante la restauración de respaldo:', err);
    return res.status(500).json({
      error: 'Error crítico al restaurar la copia de seguridad. Los datos previos se preservaron intactos.',
      details: err.message
    });
  }
}

/**
 * POST /api/storage/sync/pull
 * Retorna las entidades modificadas para sincronización local
 */
export function syncPull(req, res) {
  const empresaId = req.user.empresa_id;
  const { since } = req.body || {};

  if (!empresaId) {
    return res.status(403).json({ error: 'Acceso no permitido: Sin empresa asignada.' });
  }

  const sinceDate = since ? new Date(since) : new Date(0);
  if (Number.isNaN(sinceDate.getTime())) {
    return res.status(400).json({ error: 'La fecha de sincronización no es válida.' });
  }
  const sinceValue = sinceDate.toISOString().replace('T', ' ').slice(0, 19);

  const categorias = db.prepare('SELECT * FROM categorias WHERE empresa_id = ?').all(empresaId);
  const productos = db.prepare(`
    SELECT * FROM productos 
    WHERE empresa_id = ? AND (fecha_actualizacion >= ? OR fecha_creacion >= ?)
  `).all(empresaId, sinceValue, sinceValue);

  const movimientos = db.prepare(`
    SELECT
      m.*, p.nombre AS producto_nombre, p.codigo AS producto_codigo,
      p.unidad_medida, p.ubicacion_almacen, p.ubicacion_pasillo,
      p.ubicacion_estante, p.ubicacion_nivel, p.imagen AS producto_imagen,
      u.nombre AS usuario_nombre, u.usuario AS usuario_username
    FROM movimientos m
    JOIN productos p ON p.id = m.producto_id
    JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.empresa_id = ? AND m.fecha_creacion >= ?
    ORDER BY m.id ASC
  `).all(empresaId, sinceValue);

  const currentTimestamp = new Date().toISOString();

  db.prepare(`
    INSERT INTO sincronizacion_logs (
      empresa_id, usuario_id, dispositivo_uuid, tipo_operacion,
      entidad, registros_afectados, estado, detalles
    ) VALUES (?, ?, ?, 'DESCARGA', 'INVENTARIO', ?, 'EXITOSO', ?)
  `).run(
    empresaId,
    req.user.id,
    req.headers['x-device-uuid'] || null,
    productos.length + movimientos.length,
    `Descarga de sincronización completada desde ${sinceValue}.`
  );

  return res.json({
    timestamp: currentTimestamp,
    categorias,
    productos,
    movimientos
  });
}

/**
 * POST /api/storage/sync/push
 * Procesa mutaciones pendientes registradas offline por el cliente
 */
export function syncPush(req, res) {
  const empresaId = req.user.empresa_id;
  const usuarioId = req.user.id;
  const { mutations, dispositivo_uuid } = req.body || {};

  if (!empresaId) {
    return res.status(403).json({ error: 'Acceso no permitido: Sin empresa asignada.' });
  }

  if (!Array.isArray(mutations) || mutations.length === 0 || mutations.length > 100) {
    return res.status(400).json({ error: 'Debe enviar entre 1 y 100 operaciones pendientes.' });
  }

  const deviceUuid = String(dispositivo_uuid || req.headers['x-device-uuid'] || '').trim();
  if (!deviceUuid || deviceUuid.length > 200) {
    return res.status(400).json({ error: 'El identificador del dispositivo no es válido.' });
  }

  let appliedCount = 0;
  let conflictsCount = 0;
  const results = [];

  for (const mutation of mutations) {
    const syncId = mutation?.sync_id;
    if (typeof syncId !== 'string' || syncId.length < 1 || syncId.length > 100) {
      conflictsCount++;
      results.push({ sync_id: syncId || null, status: 'CONFLICT', message: 'El identificador de operación no es válido.' });
      continue;
    }

    if (
      (mutation.user_id !== undefined && mutation.user_id !== usuarioId) ||
      (mutation.empresa_id !== undefined && mutation.empresa_id !== empresaId)
    ) {
      return res.status(403).json({ error: 'La operación pendiente no pertenece al usuario y empresa autenticados.' });
    }

    const result = transaction((dbSync) => {
      const existing = dbSync.prepare(`
        SELECT usuario_id, dispositivo_uuid, result_json
        FROM sync_mutation_receipts
        WHERE empresa_id = ? AND sync_id = ?
      `).get(empresaId, syncId);

      if (existing) {
        if (existing.usuario_id !== usuarioId || existing.dispositivo_uuid !== deviceUuid) {
          return {
            sync_id: syncId,
            status: 'CONFLICT',
            message: 'El identificador de operación ya fue utilizado por otra sesión o dispositivo.'
          };
        }
        return { ...JSON.parse(existing.result_json), duplicate: true };
      }

      const data = mutation.data || {};
      let conflict = null;
      const productId = Number(data.producto_id);
      const product = Number.isSafeInteger(productId) && productId > 0
        ? dbSync.prepare(`
          SELECT id, nombre, codigo, stock_actual, unidad_medida, proveedor
          FROM productos
          WHERE id = ? AND empresa_id = ?
        `).get(productId, empresaId)
        : null;

      if (mutation.entity !== 'movimiento' || mutation.action !== 'CREATE') {
        conflict = 'Esta versión solo sincroniza movimientos de inventario.';
      } else if (!product) {
        conflict = 'El producto ya no existe o no pertenece a esta empresa.';
      } else if (!['INGRESO', 'DESPACHO', 'AJUSTE'].includes(data.tipo)) {
        conflict = 'El tipo de movimiento no es válido.';
      } else if (
        data.tipo === 'AJUSTE' && req.user.rol !== 'ADMINISTRADOR'
      ) {
        conflict = 'Solo un administrador puede sincronizar ajustes de inventario.';
      } else {
        const quantity = Number(data.cantidad);
        const newStock = Number(data.stock_nuevo);
        const stockBase = data.stock_base == null ? null : Number(data.stock_base);

        if (data.tipo === 'AJUSTE') {
          if (!Number.isSafeInteger(newStock) || newStock < 0 || !String(data.motivo_ajuste || '').trim()) {
            conflict = 'El ajuste requiere un stock entero no negativo y un motivo.';
          } else if (stockBase !== null && stockBase !== product.stock_actual) {
            conflict = `El stock cambió desde que se preparó el ajuste. Actual: ${product.stock_actual}, base local: ${stockBase}.`;
          } else if (newStock === product.stock_actual) {
            conflict = 'El nuevo stock es idéntico al stock actual.';
          }
        } else if (!Number.isSafeInteger(quantity) || quantity <= 0) {
          conflict = 'La cantidad debe ser un entero positivo.';
        } else if (
          data.tipo === 'DESPACHO' &&
          stockBase !== null &&
          stockBase !== product.stock_actual
        ) {
          conflict = `El stock cambió desde que se preparó el despacho. Actual: ${product.stock_actual}, base local: ${stockBase}.`;
        } else if (data.tipo === 'DESPACHO' && product.stock_actual < quantity) {
          conflict = `Stock insuficiente al sincronizar. Actual: ${product.stock_actual}, solicitado: ${quantity}.`;
        }
      }

      let status = 'CONFLICT';
      let response = null;
      if (conflict) {
        response = {
          sync_id: syncId,
          status,
          message: conflict,
          producto_id: product?.id || productId || null,
          stock_actual: product?.stock_actual ?? null,
          proveedor: product?.proveedor ?? null
        };
      } else {
        const legacyOccurredAt = data.fecha
          ? `${data.fecha}T${data.hora || '00:00:00'}Z`
          : undefined;
        const occurredAt = new Date(data.ocurrido_en || legacyOccurredAt || Date.now());
        const movementDate = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;
        const fecha = /^\d{4}-\d{2}-\d{2}$/.test(data.fecha || '')
          ? data.fecha
          : movementDate.toISOString().slice(0, 10);
        const hora = /^\d{2}:\d{2}:\d{2}$/.test(data.hora || '')
          ? data.hora
          : movementDate.toISOString().slice(11, 19);
        const stockBefore = product.stock_actual;
        let stockAfter;
        let movementQuantity;

        if (data.tipo === 'INGRESO') {
          movementQuantity = Number(data.cantidad);
          stockAfter = stockBefore + movementQuantity;
          if (data.proveedor && String(data.proveedor).trim()) {
            dbSync.prepare('UPDATE productos SET proveedor = ? WHERE id = ?').run(String(data.proveedor).trim(), product.id);
          }
        } else if (data.tipo === 'DESPACHO') {
          movementQuantity = Number(data.cantidad);
          stockAfter = stockBefore - movementQuantity;
        } else {
          stockAfter = Number(data.stock_nuevo);
          movementQuantity = Math.abs(stockAfter - stockBefore);
        }

        dbSync.prepare(`
          UPDATE productos
          SET stock_actual = ?, fecha_actualizacion = CURRENT_TIMESTAMP
          WHERE id = ? AND empresa_id = ?
        `).run(stockAfter, product.id, empresaId);

        dbSync.prepare(`
          INSERT INTO movimientos (
            producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
            usuario_id, observacion, destino, motivo_ajuste, guia_despacho,
            responsable_recepcion, fecha, hora, empresa_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          product.id,
          data.tipo,
          movementQuantity,
          stockBefore,
          stockAfter,
          usuarioId,
          data.observacion ? String(data.observacion).trim() : null,
          data.destino ? String(data.destino).trim() : null,
          data.motivo_ajuste ? String(data.motivo_ajuste).trim() : null,
          data.guia_despacho ? String(data.guia_despacho).trim() : null,
          data.responsable_recepcion ? String(data.responsable_recepcion).trim() : null,
          fecha,
          hora,
          empresaId
        );

        status = 'APPLIED';
        response = {
          sync_id: syncId,
          status,
          message: 'Movimiento sincronizado correctamente.',
          producto_id: product.id,
          stock_actual: stockAfter,
          proveedor: data.tipo === 'INGRESO' && String(data.proveedor || '').trim()
            ? String(data.proveedor).trim()
            : product.proveedor ?? null
        };
      }

      dbSync.prepare(`
        INSERT INTO sync_mutation_receipts (
          empresa_id, sync_id, usuario_id, dispositivo_uuid, status, result_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(empresaId, syncId, usuarioId, deviceUuid, response.status, JSON.stringify(response));

      return response;
    });

    results.push(result);
    if (result.status === 'APPLIED') appliedCount++;
    else conflictsCount++;
  }

  // Registrar auditoría de push
  db.prepare(`
    INSERT INTO sincronizacion_logs (
      empresa_id, usuario_id, dispositivo_uuid, tipo_operacion,
      entidad, registros_afectados, estado, detalles
    ) VALUES (?, ?, ?, 'SUBIDA', 'OFFLINE_QUEUE', ?, ?, ?)
  `).run(
    empresaId,
    usuarioId,
    deviceUuid,
    appliedCount,
    conflictsCount > 0 ? 'FALLIDO' : 'EXITOSO',
    `Sincronización offline procesada: ${appliedCount} aplicados, ${conflictsCount} conflictos, ${results.filter((result) => result.duplicate).length} reintentos idempotentes.`
  );

  return res.json({
    success: true,
    appliedCount,
    conflictsCount,
    results,
    timestamp: new Date().toISOString()
  });
}

/**
 * GET /api/storage/logs
 * Obtiene el historial de auditoría de sincronizaciones
 */
export function getSyncLogs(req, res) {
  const empresaId = req.user.empresa_id;
  const isSuperAdmin = req.user.rol === 'SUPERADMIN';

  let logs = [];
  if (isSuperAdmin && !empresaId) {
    logs = db.prepare(`
      SELECT l.*, e.nombre AS empresa_nombre, u.nombre AS usuario_nombre
      FROM sincronizacion_logs l
      LEFT JOIN empresas e ON l.empresa_id = e.id
      LEFT JOIN usuarios u ON l.usuario_id = u.id
      ORDER BY l.fecha_hora DESC
      LIMIT 100
    `).all();
  } else {
    logs = db.prepare(`
      SELECT l.*, u.nombre AS usuario_nombre
      FROM sincronizacion_logs l
      LEFT JOIN usuarios u ON l.usuario_id = u.id
      WHERE l.empresa_id = ?
      ORDER BY l.fecha_hora DESC
      LIMIT 100
    `).all(empresaId);
  }

  return res.json({ logs });
}

/**
 * GET /api/storage/admin/status
 * Panel administrativo consolidado de almacenamiento para SuperAdmin o Admin
 */
export function getAdminStorageStatus(req, res) {
  const isSuperAdmin = req.user.rol === 'SUPERADMIN';
  const empresaId = req.user.empresa_id;

  if (isSuperAdmin) {
    const empresasStatus = db.prepare(`
      SELECT 
        e.id, e.nombre, e.estado,
        COUNT(DISTINCT r.id) AS total_respaldos,
        COALESCE(SUM(r.tamano_bytes), 0) AS bytes_respaldos,
        MAX(r.fecha_creacion) AS ultimo_respaldo,
        c.modo, c.tipo_almacenamiento_local, c.estado_sincronizacion, c.proximo_respaldo
      FROM empresas e
      LEFT JOIN respaldos r ON e.id = r.empresa_id
      LEFT JOIN configuracion_almacenamiento c ON e.id = c.empresa_id
      GROUP BY e.id
      ORDER BY e.nombre ASC
    `).all();

    const globalStorage = db.prepare(`
      SELECT 
        COUNT(id) AS total_respaldos_global,
        COALESCE(SUM(tamano_bytes), 0) AS bytes_globales
      FROM respaldos
    `).get();

    return res.json({
      empresas: empresasStatus,
      global: globalStorage
    });
  }

  // Si es administrador de empresa
  const empresaStatus = db.prepare(`
    SELECT 
      e.id, e.nombre, e.estado,
      COUNT(DISTINCT r.id) AS total_respaldos,
      COALESCE(SUM(r.tamano_bytes), 0) AS bytes_respaldos,
      MAX(r.fecha_creacion) AS ultimo_respaldo,
      c.modo, c.tipo_almacenamiento_local, c.estado_sincronizacion, c.proximo_respaldo
    FROM empresas e
    LEFT JOIN respaldos r ON e.id = r.empresa_id
    LEFT JOIN configuracion_almacenamiento c ON e.id = c.empresa_id
    WHERE e.id = ?
    GROUP BY e.id
  `).get(empresaId);

  return res.json({ empresa: empresaStatus });
}
