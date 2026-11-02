const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const {
  migrateDatabaseFile,
  sameDatabasePath,
  validateDatabase
} = require('./databaseStorage.cjs');

const testDirectory = process.argv[3];
if (!testDirectory || !fs.existsSync(testDirectory)) {
  throw new Error(`El directorio temporal de pruebas no existe: ${testDirectory || '(vacío)'}`);
}

function createDatabase(filePath, marker) {
  const database = new DatabaseSync(filePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE parent_data (id INTEGER PRIMARY KEY);
    CREATE TABLE source_data (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER NOT NULL REFERENCES parent_data(id),
      label TEXT NOT NULL
    );
    INSERT INTO parent_data (id) VALUES (1);
    INSERT INTO source_data (id, parent_id, label) VALUES (1, 1, '${marker}');
  `);
  database.close();
}

const sourcePath = path.join(testDirectory, 'source.sqlite');
const destinationPath = path.join(testDirectory, 'migrated', 'database.sqlite');
createDatabase(sourcePath, 'preserved');

migrateDatabaseFile(sourcePath, destinationPath);
validateDatabase(sourcePath);
validateDatabase(destinationPath);

const copied = new DatabaseSync(destinationPath, { readOnly: true });
assert.equal(copied.prepare('SELECT label FROM source_data WHERE id = 1').get().label, 'preserved');
copied.close();
assert.equal(fs.existsSync(sourcePath), true);

assert.throws(() => migrateDatabaseFile(sourcePath, destinationPath), /already exists|ya existe/i);
const destination = new DatabaseSync(destinationPath);
destination.prepare("UPDATE source_data SET label = 'still here' WHERE id = 1").run();
destination.close();
assert.throws(() => migrateDatabaseFile(sourcePath, destinationPath), /already exists|ya existe/i);
const unchanged = new DatabaseSync(destinationPath, { readOnly: true });
assert.equal(unchanged.prepare('SELECT label FROM source_data WHERE id = 1').get().label, 'still here');
unchanged.close();

assert.equal(sameDatabasePath(sourcePath, sourcePath), true);

const malformedPath = path.join(testDirectory, 'invalid.sqlite');
fs.writeFileSync(malformedPath, 'not a SQLite database');
assert.throws(() => validateDatabase(malformedPath));

const foreignKeyPath = path.join(testDirectory, 'invalid-foreign-key.sqlite');
const invalidDatabase = new DatabaseSync(foreignKeyPath);
invalidDatabase.exec(`
  PRAGMA foreign_keys = OFF;
  CREATE TABLE parent_data (id INTEGER PRIMARY KEY);
  CREATE TABLE child_data (parent_id INTEGER REFERENCES parent_data(id));
  INSERT INTO child_data (parent_id) VALUES (99);
`);
invalidDatabase.close();
assert.throws(() => validateDatabase(foreignKeyPath), /claves foráneas inválidas/);

console.log('Desktop SQLite migration checks passed.');
