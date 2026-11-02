const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

function sameDatabasePath(firstPath, secondPath) {
  const first = path.resolve(firstPath);
  const second = path.resolve(secondPath);
  return process.platform === 'win32'
    ? first.toLowerCase() === second.toLowerCase()
    : first === second;
}

function validateDatabase(filePath) {
  const database = new DatabaseSync(filePath, { readOnly: true });
  try {
    const integrity = database.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
      throw new Error('La comprobación de integridad de SQLite no pasó.');
    }
    if (database.prepare('PRAGMA foreign_key_check').all().length > 0) {
      throw new Error('La base de datos contiene relaciones con claves foráneas inválidas.');
    }
  } finally {
    database.close();
  }
}

function validateWritableDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
  const testPath = path.join(directoryPath, `.logixt-write-test-${randomBytes(8).toString('hex')}`);
  fs.writeFileSync(testPath, 'ok', { flag: 'wx' });
  fs.unlinkSync(testPath);
}

function checkpointDatabase(filePath) {
  const database = new DatabaseSync(filePath);
  try {
    const checkpoint = database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    if (checkpoint?.busy) {
      throw new Error('SQLite no pudo completar el checkpoint WAL antes de la migración.');
    }
  } finally {
    database.close();
  }

  const walPath = `${filePath}-wal`;
  if (fs.existsSync(walPath) && fs.statSync(walPath).size > 0) {
    throw new Error('SQLite conserva datos pendientes en WAL; se canceló la copia.');
  }
}

function removeTemporarySidecars(filePath) {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const sidecarPath = `${filePath}${suffix}`;
    if (fs.existsSync(sidecarPath)) fs.unlinkSync(sidecarPath);
  }
}

function migrateDatabaseFile(sourcePath, destinationPath) {
  if (sameDatabasePath(sourcePath, destinationPath)) {
    throw new Error('La ubicación nueva debe ser diferente a la ubicación actual.');
  }
  if (fs.existsSync(destinationPath)) {
    throw new Error('La base de datos de destino ya existe; no se reemplazará.');
  }

  validateDatabase(sourcePath);
  checkpointDatabase(sourcePath);
  validateWritableDirectory(path.dirname(destinationPath));
  const temporaryPath = `${destinationPath}.${process.pid}.${randomBytes(6).toString('hex')}.migrating`;
  try {
    fs.copyFileSync(sourcePath, temporaryPath, fs.constants.COPYFILE_EXCL);
    validateDatabase(temporaryPath);
    checkpointDatabase(temporaryPath);
    removeTemporarySidecars(temporaryPath);
    fs.copyFileSync(temporaryPath, destinationPath, fs.constants.COPYFILE_EXCL);
    validateDatabase(destinationPath);
    checkpointDatabase(destinationPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    removeTemporarySidecars(temporaryPath);
  }
}

module.exports = {
  migrateDatabaseFile,
  sameDatabasePath,
  validateDatabase,
  validateWritableDirectory
};
