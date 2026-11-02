import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function performBackup() {
  const dbPath = process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.resolve(__dirname, '../../database.sqlite');

  const backupsDir = path.resolve(__dirname, '../../backups');

  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Error: No se encontró la base de datos en: ${dbPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  // Si la librería node:sqlite está disponible, forzamos un checkpoint WAL para consistencia
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    db.close();
  } catch (err) {
    // Si no se puede abrir temporalmente, continuamos con la copia directa
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const backupFileName = `database-backup-${dateStr}.sqlite`;
  const backupFilePath = path.join(backupsDir, backupFileName);

  fs.copyFileSync(dbPath, backupFilePath);

  const stats = fs.statSync(backupFilePath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('====================================================');
  console.log('💾 COPIA DE SEGURIDAD DE BASE DE DATOS COMPLETADA');
  console.log(`📁 Origen:  ${dbPath}`);
  console.log(`📦 Destino: ${backupFilePath}`);
  console.log(`📊 Tamaño:  ${sizeMb} MB (${stats.size} bytes)`);
  console.log(`⏰ Fecha:   ${now.toISOString()}`);
  console.log('====================================================');

  return backupFilePath;
}

// Ejecutar directamente si se llama via script CLI
if (process.argv[1] && process.argv[1].endsWith('backup.js')) {
  performBackup().catch((err) => {
    console.error('Error al realizar backup:', err);
    process.exit(1);
  });
}
