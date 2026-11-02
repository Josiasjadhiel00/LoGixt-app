import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH
  ? (path.isAbsolute(process.env.DB_PATH) ? process.env.DB_PATH : path.resolve(process.cwd(), process.env.DB_PATH))
  : path.resolve(__dirname, '../../database.sqlite');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);

// Configuración de integridad y rendimiento (WAL mode, Foreign Keys)
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// Migraciones seguras para columnas requeridas antes de crear índices
const safeAddColumn = (table, columnDef) => {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`);
  } catch {}
};

safeAddColumn('usuarios', 'empresa_id INTEGER REFERENCES empresas(id)');
safeAddColumn('usuarios', 'apellido TEXT');
safeAddColumn('usuarios', 'email TEXT');
safeAddColumn('usuarios', 'telefono TEXT');
safeAddColumn('usuarios', 'foto TEXT');
safeAddColumn('usuarios', "tema TEXT DEFAULT 'logixt'");
safeAddColumn('usuarios', "color_acento TEXT DEFAULT 'purple'");
safeAddColumn('planes', 'max_dispositivos INTEGER DEFAULT 1');
safeAddColumn('categorias', 'empresa_id INTEGER REFERENCES empresas(id)');
safeAddColumn('categorias', 'prefijo TEXT');
safeAddColumn('categorias', 'imagen TEXT');
safeAddColumn('productos', 'empresa_id INTEGER REFERENCES empresas(id)');
safeAddColumn('movimientos', 'empresa_id INTEGER REFERENCES empresas(id)');
safeAddColumn('movimientos', 'guia_despacho TEXT');
safeAddColumn('movimientos', 'responsable_recepcion TEXT');
safeAddColumn('usuarios', 'almacenamiento_configurado INTEGER DEFAULT 0');
safeAddColumn('usuarios', "almacenamiento_modo TEXT DEFAULT 'LOCAL_SYNC'");

// Inicializar esquema base
const schemaPath = path.resolve(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
try {
  db.exec(schemaSql);
} catch (err) {
  console.warn('Advertencia al sincronizar schema.sql:', err.message);
}

/**
 * Ejecuta una función dentro de una transacción atómica SQLite.
 * Si ocurre un error, revierte automáticamente los cambios (ROLLBACK).
 */
export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

export default db;
