import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PORT = 5055;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function makeRequest(urlPath, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const req = http.request(
      url,
      {
        method,
        headers: {
          ...headers,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {
            // Not JSON
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body,
            json,
          });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🚀 INICIANDO SUITE DE PRUEBAS DE DESPLIEGUE EN PRODUCCIÓN');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // TEST 1: Validación estricta de JWT en producción (arranque fallido si JWT es inseguro o falta)
  console.log('\n--- 1. Validación de Seguridad JWT en Producción ---');
  {
    const missingJwtProcess = spawn('node', ['src/app.js'], {
      cwd: __dirname,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        JWT_SECRET: '',
        PORT: '5098',
      },
    });

    const exitCodeMissing = await new Promise((resolve) => {
      missingJwtProcess.on('exit', (code) => resolve(code));
    });

    assert(
      exitCodeMissing === 1,
      'Servidor rechaza iniciar en producción cuando JWT_SECRET está vacío (exit code 1)'
    );

    const defaultJwtProcess = spawn('node', ['src/app.js'], {
      cwd: __dirname,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        JWT_SECRET: 'CAMBIAR_EN_PRODUCCION',
        PORT: '5099',
      },
    });

    const exitCodeDefault = await new Promise((resolve) => {
      defaultJwtProcess.on('exit', (code) => resolve(code));
    });

    assert(
      exitCodeDefault === 1,
      'Servidor rechaza iniciar en producción cuando JWT_SECRET tiene el valor por defecto inseguro (exit code 1)'
    );
  }

  // TEST 2: Arranque de Servidor en modo Producción Monolítico
  console.log('\n--- 2. Arranque del Servidor en Producción ---');
  const serverProcess = spawn('node', ['src/app.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(TEST_PORT),
      JWT_SECRET: 'super_secure_production_jwt_secret_key_998877_xyz',
      CLIENT_URL: 'http://127.0.0.1:5055',
    },
  });

  serverProcess.stdout.on('data', (d) => {
    console.log(`[Server]: ${d.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (d) => {
    console.error(`[Server Err]: ${d.toString().trim()}`);
  });

  // Esperar a que el servidor esté activo
  let serverReady = false;
  for (let i = 0; i < 20; i++) {
    await wait(300);
    try {
      const res = await makeRequest('/api/health');
      if (res.statusCode === 200) {
        serverReady = true;
        break;
      }
    } catch {
      // Reintentando
    }
  }

  assert(serverReady, `Servidor iniciado exitosamente en puerto ${TEST_PORT}`);

  if (!serverReady) {
    console.error('El servidor no pudo arrancar. Abortando pruebas.');
    serverProcess.kill();
    process.exit(1);
  }

  // TEST 3: Health Check Endpoint
  console.log('\n--- 3. Verificación de Health Check (/api/health) ---');
  {
    const res = await makeRequest('/api/health');
    assert(res.statusCode === 200, 'GET /api/health devuelve 200 OK');
    assert(res.json?.status === 'online' || res.json?.status === 'ok', 'GET /api/health reporta status activo ("online")');
    assert(res.json?.database === 'connected', 'GET /api/health confirma base de datos conectada');
    assert(res.json?.environment === 'production', 'GET /api/health reporta ambiente "production"');
    assert(typeof res.json?.uptime === 'number', 'GET /api/health incluye métrica uptime');
  }

  // TEST 4: Entrega de SPA Frontend y Manejo de Rutas
  console.log('\n--- 4. Entrega de Frontend Estático y Fallback SPA ---');
  {
    // Raíz '/'
    const rootRes = await makeRequest('/');
    assert(rootRes.statusCode === 200, 'GET / devuelve 200 OK');
    assert(
      rootRes.headers['content-type']?.includes('text/html'),
      'GET / devuelve Content-Type text/html'
    );
    assert(
      rootRes.body.includes('<div id="root">') || rootRes.body.includes('<!DOCTYPE html>') || rootRes.body.includes('Logixt'),
      'GET / contiene el bundle HTML de Vite/React'
    );

    // Ruta profunda de cliente (SPA fallback)
    const spaRes = await makeRequest('/dispositivos');
    assert(spaRes.statusCode === 200, 'GET /dispositivos devuelve 200 OK (SPA fallback)');
    assert(
      spaRes.headers['content-type']?.includes('text/html'),
      'GET /dispositivos devuelve index.html para react-router/SPA'
    );
  }

  // TEST 5: Manejador de 404 para Endpoints /api/* inexistentes
  console.log('\n--- 5. Manejo de 404 en API REST (/api/*) ---');
  {
    const unknownApiRes = await makeRequest('/api/endpoint-inexistente-123');
    assert(unknownApiRes.statusCode === 404, 'GET /api/endpoint-inexistente-123 devuelve 404');
    assert(
      unknownApiRes.headers['content-type']?.includes('application/json'),
      'GET /api/endpoint-inexistente-123 devuelve JSON (no HTML)'
    );
    assert(
      unknownApiRes.json?.error?.includes('Endpoint no encontrado'),
      'GET /api/endpoint-inexistente-123 devuelve mensaje de error claro en JSON'
    );
  }

  // TEST 6: CORS Headers
  console.log('\n--- 6. Configuración CORS ---');
  {
    const corsRes = await makeRequest('/api/health', 'GET', {
      Origin: 'http://127.0.0.1:5055',
    });
    assert(
      corsRes.headers['access-control-allow-origin'] === 'http://127.0.0.1:5055',
      'CORS permite origen configurado en CLIENT_URL'
    );
  }

  // TEST 7: Script de Copia de Seguridad
  console.log('\n--- 7. Verificación de Backup SQLite ---');
  {
    const { performBackup } = await import('./src/scripts/backup.js');
    const backupFile = await performBackup();
    assert(fs.existsSync(backupFile), `Archivo de backup creado exitosamente en ${path.basename(backupFile)}`);
    const backupStat = fs.statSync(backupFile);
    assert(backupStat.size > 0, `Archivo de backup tiene contenido válido (${backupStat.size} bytes)`);
  }

  // Limpieza: matar proceso del servidor
  serverProcess.kill();
  console.log('\n====================================================');
  console.log(`🏁 RESULTADOS: ${passed} pasadas, ${failed} fallidas`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Error fatal durante la prueba:', err);
  process.exit(1);
});
