// Pruebas del servicio de identidades Firebase (sin tocar Firebase real).
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'logixt-fb-')), 'import.sqlite');
const { createFirebaseUserService, normalizeEmail } = await import('./src/services/firebaseUsers.js');

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS: ${name}`);
}

function makeDb() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nombre TEXT, email TEXT, firebase_uid TEXT);
    CREATE UNIQUE INDEX uq_uid ON usuarios(firebase_uid) WHERE firebase_uid IS NOT NULL;
    INSERT INTO usuarios (id, nombre, email) VALUES (1, 'Super', 'super@logixt.com'), (2, 'Ana', NULL), (3, 'Luis', NULL);
  `);
  return database;
}

function makeAuth(existing = []) {
  const users = new Map(existing.map((u) => [u.email, u]));
  let n = 0;
  return {
    users,
    async getUserByEmail(email) {
      if (!users.has(email)) { const e = new Error('no user'); e.code = 'auth/user-not-found'; throw e; }
      return users.get(email);
    },
    async createUser({ email, displayName }) {
      const user = { uid: `uid-${++n}`, email, displayName, providerData: [] };
      users.set(email, user);
      return user;
    }
  };
}

function makeFetch(ok = true) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options });
    return { ok, status: ok ? 200 : 400, json: async () => (ok ? {} : { error: { message: 'EMAIL_NOT_FOUND' } }) };
  };
  fn.calls = calls;
  return fn;
}

const env = { FIREBASE_WEB_API_KEY: 'KEY123', CLIENT_URL: 'https://lo-gixt-app.vercel.app' };

await test('normalizeEmail limpia y valida', () => {
  assert.equal(normalizeEmail('  Ana@Correo.COM '), 'ana@correo.com');
  assert.equal(normalizeEmail('sin-arroba'), null);
  assert.equal(normalizeEmail('a@b'), null);
  assert.equal(normalizeEmail(null), null);
});

await test('emailInUse ignora al propio usuario y distingue mayúsculas', () => {
  const database = makeDb();
  const svc = createFirebaseUserService({ database, getAuth: () => null, env });
  assert.equal(svc.emailInUse('SUPER@logixt.com'), true);
  assert.equal(svc.emailInUse('super@logixt.com', 1), false);
  assert.equal(svc.emailInUse('otro@logixt.com'), false);
});

await test('correo nuevo: crea la cuenta, la vincula y envía el correo', async () => {
  const database = makeDb();
  const auth = makeAuth();
  const fetchFn = makeFetch(true);
  const svc = createFirebaseUserService({ database, getAuth: () => auth, fetchFn, env });
  const result = await svc.provision({ userId: 2, email: 'Ana@Correo.com', displayName: 'Ana' });
  assert.equal(result.status, 'created');
  assert.equal(result.emailSent, true);
  assert.equal(database.prepare('SELECT firebase_uid FROM usuarios WHERE id = 2').get().firebase_uid, 'uid-1');
  assert.equal(fetchFn.calls.length, 1);
  assert.match(fetchFn.calls[0].url, /accounts:sendOobCode\?key=KEY123/);
  assert.deepEqual(JSON.parse(fetchFn.calls[0].options.body), { requestType: 'PASSWORD_RESET', email: 'ana@correo.com' });
  assert.equal(fetchFn.calls[0].options.headers.Referer, 'https://lo-gixt-app.vercel.app/');
});

await test('cuenta Firebase ya existente con contraseña: solo vincula, no envía correo', async () => {
  const database = makeDb();
  const auth = makeAuth([{ uid: 'uid-x', email: 'ana@correo.com', providerData: [{ providerId: 'password' }] }]);
  const fetchFn = makeFetch(true);
  const svc = createFirebaseUserService({ database, getAuth: () => auth, fetchFn, env });
  const result = await svc.provision({ userId: 2, email: 'ana@correo.com' });
  assert.equal(result.status, 'linked');
  assert.equal(fetchFn.calls.length, 0);
  assert.equal(database.prepare('SELECT firebase_uid FROM usuarios WHERE id = 2').get().firebase_uid, 'uid-x');
});

await test('cuenta Firebase ya vinculada a otro usuario: no se reasigna', async () => {
  const database = makeDb();
  database.prepare("UPDATE usuarios SET firebase_uid = 'uid-x' WHERE id = 3").run();
  const auth = makeAuth([{ uid: 'uid-x', email: 'ana@correo.com', providerData: [{ providerId: 'password' }] }]);
  const svc = createFirebaseUserService({ database, getAuth: () => auth, fetchFn: makeFetch(), env });
  const result = await svc.provision({ userId: 2, email: 'ana@correo.com' });
  assert.equal(result.status, 'skipped');
  assert.equal(database.prepare('SELECT firebase_uid FROM usuarios WHERE id = 2').get().firebase_uid, null);
});

await test('Firebase sin configurar: no falla y avisa', async () => {
  const svc = createFirebaseUserService({ database: makeDb(), getAuth: () => null, env });
  const result = await svc.provision({ userId: 2, email: 'ana@correo.com' });
  assert.equal(result.status, 'skipped');
  assert.match(result.message, /no está configurado/);
});

await test('Firebase mal configurado (excepción): no falla', async () => {
  const svc = createFirebaseUserService({ database: makeDb(), getAuth: () => { throw new Error('json inválido'); }, env });
  const result = await svc.provision({ userId: 2, email: 'ana@correo.com' });
  assert.equal(result.status, 'skipped');
});

await test('sin FIREBASE_WEB_API_KEY: crea la cuenta pero avisa que no pudo enviar el correo', async () => {
  const database = makeDb();
  const fetchFn = makeFetch(true);
  const svc = createFirebaseUserService({ database, getAuth: () => makeAuth(), fetchFn, env: {} });
  const result = await svc.provision({ userId: 2, email: 'ana@correo.com' });
  assert.equal(result.status, 'created');
  assert.equal(result.emailSent, false);
  assert.equal(fetchFn.calls.length, 0);
});

await test('Firebase rechaza el envío: se informa sin lanzar error', async () => {
  const svc = createFirebaseUserService({ database: makeDb(), getAuth: () => makeAuth(), fetchFn: makeFetch(false), env });
  const result = await svc.provision({ userId: 2, email: 'ana@correo.com' });
  assert.equal(result.status, 'created');
  assert.equal(result.emailSent, false);
});

await test('error inesperado de Firebase Admin: devuelve status error', async () => {
  const auth = { async getUserByEmail() { const e = new Error('boom'); e.code = 'auth/internal-error'; throw e; } };
  const svc = createFirebaseUserService({ database: makeDb(), getAuth: () => auth, fetchFn: makeFetch(), env });
  const result = await svc.provision({ userId: 2, email: 'ana@correo.com' });
  assert.equal(result.status, 'error');
});

await test('correo inválido se omite', async () => {
  const svc = createFirebaseUserService({ database: makeDb(), getAuth: () => makeAuth(), fetchFn: makeFetch(), env });
  assert.equal((await svc.provision({ userId: 2, email: 'xx' })).status, 'skipped');
});

console.log(`\n${passed} pruebas pasaron.`);
