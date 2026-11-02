const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function removeSqliteSidecars(directoryPath) {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      removeSqliteSidecars(entryPath);
    } else if (/(?:-wal|-shm|-journal)$/.test(entry.name)) {
      fs.rmSync(entryPath, { force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
}

if (process.argv[2] === '--worker') {
  require('./test-database-storage-worker.cjs');
} else {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'logixt-db-migration-'));
  const result = spawnSync(process.execPath, [__filename, '--worker', testDirectory], {
    stdio: 'inherit'
  });

  try {
    removeSqliteSidecars(testDirectory);
    fs.rmSync(testDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    console.error('No se pudo limpiar el directorio temporal de las pruebas:', error);
    process.exitCode = 1;
  }

  if (result.error) {
    console.error('No se pudieron iniciar las pruebas SQLite:', result.error);
    process.exitCode = 1;
  } else if (result.status !== 0) {
    process.exitCode = result.status || 1;
  }
}
