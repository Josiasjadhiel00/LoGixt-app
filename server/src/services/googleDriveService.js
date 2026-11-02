import crypto from 'node:crypto';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

export class GoogleDriveServiceError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'GoogleDriveServiceError';
    this.status = status;
  }
}

function parseEncryptionKey(value) {
  if (!value) return null;

  if (/^[\da-f]{64}$/i.test(value)) {
    return Buffer.from(value, 'hex');
  }

  const decoded = Buffer.from(value, 'base64');
  return decoded.length === 32 && decoded.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '')
    ? decoded
    : null;
}

export function getGoogleDriveConfiguration() {
  const missing = [];
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  const clientUrl = process.env.CLIENT_URL?.trim();
  const encryptionKey = parseEncryptionKey(process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY?.trim());

  if (!clientId) missing.push('GOOGLE_OAUTH_CLIENT_ID');
  if (!clientSecret) missing.push('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!redirectUri) missing.push('GOOGLE_OAUTH_REDIRECT_URI');
  if (!clientUrl) missing.push('CLIENT_URL');
  if (!encryptionKey) missing.push('GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY');

  for (const [name, value] of [
    ['GOOGLE_OAUTH_REDIRECT_URI', redirectUri],
    ['CLIENT_URL', clientUrl]
  ]) {
    if (!value) continue;
    try {
      const url = new URL(value);
      const isLocalHttp = url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (!['https:', 'http:'].includes(url.protocol) ||
          (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') ||
          (url.protocol === 'http:' && !isLocalHttp)) {
        missing.push(`${name} (debe usar HTTPS, excepto localhost en desarrollo)`);
      }
    } catch {
      missing.push(`${name} (URL inválida)`);
    }
  }

  return {
    configured: missing.length === 0,
    missing,
    clientId,
    clientSecret,
    redirectUri,
    clientUrl,
    encryptionKey
  };
}

export function encryptGoogleDriveSecret(secret, context) {
  const { encryptionKey } = getGoogleDriveConfiguration();
  if (!encryptionKey) {
    throw new GoogleDriveServiceError('Falta una clave válida para cifrar credenciales de Google Drive.', 503);
  }
  if (typeof context !== 'string' || !context) {
    throw new GoogleDriveServiceError('Falta el contexto de cifrado para una credencial de Google Drive.', 500);
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);

  return JSON.stringify({
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64')
  });
}

export function decryptGoogleDriveSecret(encryptedSecret, context) {
  const { encryptionKey } = getGoogleDriveConfiguration();
  if (!encryptionKey) {
    throw new GoogleDriveServiceError('Falta la clave necesaria para descifrar credenciales de Google Drive.', 503);
  }
  if (typeof context !== 'string' || !context) {
    throw new GoogleDriveServiceError('Falta el contexto de cifrado para una credencial de Google Drive.', 500);
  }

  let payload;
  try {
    payload = JSON.parse(encryptedSecret);
  } catch {
    throw new GoogleDriveServiceError('Las credenciales guardadas de Google Drive no son válidas.', 500);
  }
  if (payload?.version !== 1 || !payload.iv || !payload.tag || !payload.data) {
    throw new GoogleDriveServiceError('Las credenciales guardadas de Google Drive no son válidas.', 500);
  }

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey,
      Buffer.from(payload.iv, 'base64')
    );
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final()
    ]).toString('utf8');
  } catch {
    throw new GoogleDriveServiceError('No se pudieron descifrar las credenciales de Google Drive. Comprueba la clave de cifrado configurada.', 500);
  }
}

export function createGoogleDriveAuthorizationUrl(state, codeVerifier) {
  const config = getGoogleDriveConfiguration();
  if (!config.configured) {
    throw new GoogleDriveServiceError('Google Drive no está configurado en el servidor.', 503);
  }

  const challenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  }).toString();
  return url.toString();
}

async function postOAuthForm(url, params, operation) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new GoogleDriveServiceError(`No se pudo conectar con Google para ${operation}.`, 502);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (operation === 'renovación del acceso' && data.error === 'invalid_grant') {
      throw new GoogleDriveServiceError(
        'La autorización de Google Drive expiró o fue revocada. Desconecta y vuelve a conectar la cuenta.',
        409
      );
    }
    throw new GoogleDriveServiceError(`Google rechazó la operación de ${operation} (HTTP ${response.status}).`, response.status);
  }
  return data;
}

export async function exchangeGoogleDriveCode(code, codeVerifier) {
  const config = getGoogleDriveConfiguration();
  return postOAuthForm(OAUTH_TOKEN_URL, {
    code,
    code_verifier: codeVerifier,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code'
  }, 'autorización OAuth');
}

export async function refreshGoogleDriveAccessToken(refreshToken) {
  const config = getGoogleDriveConfiguration();
  return postOAuthForm(OAUTH_TOKEN_URL, {
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token'
  }, 'renovación del acceso');
}

export async function revokeGoogleDriveToken(token) {
  return postOAuthForm(OAUTH_REVOKE_URL, { token }, 'desconexión de la cuenta');
}

export function getGoogleDriveApiUrl(pathname, query) {
  const url = new URL(pathname.replace(/^\/+/, ''), `${DRIVE_API_BASE}/`);
  if (query) url.search = new URLSearchParams(query).toString();
  return url.toString();
}

export function getGoogleDriveUploadUrl(pathname, query) {
  const url = new URL(pathname.replace(/^\/+/, ''), `${DRIVE_UPLOAD_BASE}/`);
  if (query) url.search = new URLSearchParams(query).toString();
  return url.toString();
}

export async function googleDriveApiRequest(accessToken, url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${accessToken}`
      },
      signal: options.signal || AbortSignal.timeout(120000)
    });
  } catch {
    throw new GoogleDriveServiceError('No se pudo conectar con Google Drive.', 502);
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new GoogleDriveServiceError(
        'La autorización de Google Drive ya no es válida. Desconecta y vuelve a conectar la cuenta.',
        409
      );
    }
    throw new GoogleDriveServiceError(`Google Drive rechazó la solicitud (HTTP ${response.status}).`, response.status);
  }
  return response;
}

export { DRIVE_SCOPE };
