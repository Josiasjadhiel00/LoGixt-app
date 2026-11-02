const { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage } = require('electron');
const { fork } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const {
  migrateDatabaseFile,
  sameDatabasePath,
  validateDatabase,
  validateWritableDirectory
} = require('./databaseStorage.cjs');

const appRoot = path.resolve(__dirname, '..');
const serverDirectory = path.join(appRoot, 'server');
const serverEntry = path.join(appRoot, 'server', 'src', 'app.js');
const settingsPath = path.join(app.getPath('userData'), 'desktop-settings.json');
const jwtSecretPath = path.join(app.getPath('userData'), 'jwt-secret.txt');

let settings;
let jwtSecret;
let backendProcess = null;
let backendPort = null;
let mainWindow = null;
let isSwitchingDatabase = false;
let cleanupInProgress = false;
let allowQuit = false;
const ownsSingleInstanceLock = app.requestSingleInstanceLock();

if (ownsSingleInstanceLock) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
} else {
  app.quit();
}

function writeAtomic(filePath, contents) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, contents, { flag: 'w', mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function readSettings() {
  if (!fs.existsSync(settingsPath)) {
    return {
      databasePath: path.join(app.getPath('userData'), 'database.sqlite'),
      port: null,
      databaseInitialized: false
    };
  }

  const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  if (
    typeof parsed.databasePath !== 'string' ||
    !path.isAbsolute(parsed.databasePath) ||
    (parsed.port !== null && (!Number.isInteger(parsed.port) || parsed.port < 1 || parsed.port > 65535)) ||
    (parsed.databaseInitialized !== undefined && typeof parsed.databaseInitialized !== 'boolean')
  ) {
    throw new Error('La configuración de escritorio está incompleta o dañada.');
  }
  return { ...parsed, databaseInitialized: parsed.databaseInitialized === true };
}

function saveSettings(nextSettings) {
  writeAtomic(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`);
  settings = nextSettings;
}

async function loadJwtSecret() {
  if (fs.existsSync(jwtSecretPath)) {
    const stored = fs.readFileSync(jwtSecretPath, 'utf8').trim();
    if (stored.startsWith('encrypted:')) {
      if (!await safeStorage.isAsyncEncryptionAvailable()) {
        throw new Error('No está disponible el descifrado seguro del secreto local de autenticación.');
      }
      return validateJwtSecret(await safeStorage.decryptStringAsync(
        Buffer.from(stored.slice('encrypted:'.length), 'base64')
      ));
    }
    if (stored.startsWith('plain:')) {
      return validateJwtSecret(stored.slice('plain:'.length));
    }
    throw new Error('El secreto local de autenticación tiene un formato desconocido.');
  }

  const secret = randomBytes(48).toString('base64url');
  if (await safeStorage.isAsyncEncryptionAvailable()) {
    const encrypted = (await safeStorage.encryptStringAsync(secret)).toString('base64');
    writeAtomic(jwtSecretPath, `encrypted:${encrypted}\n`);
  } else {
    console.warn('Electron safeStorage no está disponible; el secreto JWT se guardará en el perfil local del usuario.');
    writeAtomic(jwtSecretPath, `plain:${secret}\n`);
  }
  return secret;
}

function validateJwtSecret(secret) {
  if (Buffer.byteLength(secret) < 32) {
    throw new Error('El secreto JWT local no tiene la longitud mínima requerida.');
  }
  return secret;
}

async function findAvailablePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  await new Promise((resolve, reject) => {
    probe.close((error) => error ? reject(error) : resolve());
  });
  if (!address || typeof address === 'string') {
    throw new Error('No se pudo asignar un puerto local para el servidor.');
  }
  return address.port;
}

function startBackend(databasePath) {
  return new Promise((resolve, reject) => {
    const child = fork(serverEntry, [], {
      cwd: serverDirectory,
      execPath: process.execPath,
      execArgv: [],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        PORT: String(settings.port),
        HOST: '127.0.0.1',
        DB_PATH: databasePath,
        JWT_SECRET: jwtSecret,
        CLIENT_URL: `http://127.0.0.1:${settings.port}`,
        SEED_DEMO_DATA: 'false'
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });

    backendProcess = child;
    let settled = false;
    let serverStarted = false;
    const timer = setTimeout(() => {
      finish(new Error('El backend local no inició dentro del tiempo esperado.'));
      child.kill();
    }, 20000);

    const finish = (error, port) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        backendProcess = null;
        reject(error);
      } else {
        backendPort = port;
        resolve(port);
      }
    };

    child.stdout.on('data', (data) => console.log(`[LOGIXT backend] ${data.toString().trimEnd()}`));
    child.stderr.on('data', (data) => console.error(`[LOGIXT backend] ${data.toString().trimEnd()}`));
    child.once('error', (error) => finish(error));
    child.on('message', (message) => {
      if (message?.type === 'server-ready') {
        serverStarted = true;
        finish(null, message.port);
      }
      if (message?.type === 'shutdown-error') console.error(`Error al cerrar SQLite: ${message.message}`);
    });
    child.once('exit', (code, signal) => {
      if (!settled) {
        finish(new Error(`El backend local terminó antes de iniciar (código ${code}, señal ${signal || 'ninguna'}).`));
      }
      if (backendProcess === child) backendProcess = null;
      if (serverStarted && !isSwitchingDatabase && !allowQuit && !cleanupInProgress) {
        void showError('El backend local se cerró inesperadamente. La base de datos no se cambiará automáticamente.');
      }
    });
  });
}

function stopBackend() {
  const child = backendProcess;
  if (!child) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('El backend no respondió al cierre seguro; no se cambiará la ubicación de la base de datos.'));
    }, 15000);

    child.once('exit', () => {
      clearTimeout(timer);
      backendProcess = null;
      backendPort = null;
      resolve();
    });

    if (!child.connected) {
      clearTimeout(timer);
      reject(new Error('No se pudo solicitar el cierre seguro del backend.'));
      return;
    }

    child.send({ type: 'shutdown' }, (error) => {
      if (error) {
        clearTimeout(timer);
        reject(new Error(`No se pudo solicitar el cierre seguro del backend: ${error.message}`));
      }
    });
  });
}

async function showError(message) {
  const options = {
    type: 'error',
    title: 'LOGIXT — Error de escritorio',
    message
  };
  if (mainWindow) {
    await dialog.showMessageBox(mainWindow, options);
  } else {
    await dialog.showMessageBox(options);
  }
}

async function selectDatabaseLocation() {
  const selection = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar carpeta para database.sqlite',
    buttonLabel: 'Usar esta carpeta',
    properties: ['openDirectory', 'createDirectory']
  });
  if (selection.canceled || selection.filePaths.length === 0) {
    return { changed: false, canceled: true };
  }

  const directoryPath = selection.filePaths[0];
  const destinationPath = path.join(directoryPath, 'database.sqlite');
  if (sameDatabasePath(destinationPath, settings.databasePath)) {
    return { changed: false, canceled: false, databasePath: settings.databasePath };
  }

  try {
    validateWritableDirectory(directoryPath);
  } catch (error) {
    await showError(`No se puede escribir en la carpeta seleccionada.\n\n${error.message}`);
    return { changed: false, canceled: false };
  }

  const destinationExists = fs.existsSync(destinationPath);
  if (destinationExists) {
    try {
      validateDatabase(destinationPath);
    } catch (error) {
      await showError(`La base de datos existente no es íntegra; no se reemplazará.\n\n${error.message}`);
      return { changed: false, canceled: false };
    }

    const decision = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Base de datos existente',
      message: 'Ya existe database.sqlite en esa carpeta.',
      detail: 'Si continúas, LOGIXT abrirá esa base. La base actual permanecerá intacta en su ubicación.',
      buttons: ['Cancelar', 'Abrir la existente'],
      defaultId: 0,
      cancelId: 0
    });
    if (decision.response !== 1) return { changed: false, canceled: true };
  } else {
    const decision = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Migrar base de datos',
      message: 'LOGIXT copiará la base de datos actual a la carpeta seleccionada.',
      detail: 'La base original se conservará. No desconectes la unidad durante la copia.',
      buttons: ['Cancelar', 'Copiar y cambiar ubicación'],
      defaultId: 0,
      cancelId: 0
    });
    if (decision.response !== 1) return { changed: false, canceled: true };
  }

  const previousPath = settings.databasePath;
  isSwitchingDatabase = true;
  let backendWasStopped = false;
  try {
    await stopBackend();
    backendWasStopped = true;

    if (!destinationExists) {
      migrateDatabaseFile(previousPath, destinationPath);
    }

    await startBackend(destinationPath);
    saveSettings({
      ...settings,
      databasePath: destinationPath,
      databaseInitialized: true
    });
    await mainWindow.loadURL(`http://127.0.0.1:${backendPort}/`);
    return { changed: true, canceled: false, databasePath: destinationPath };
  } catch (error) {
    if (backendProcess) {
      try {
        await stopBackend();
        backendWasStopped = true;
      } catch (stopError) {
        await showError(`No se pudo cerrar el backend tras el error: ${stopError.message}`);
      }
    }
    if (backendWasStopped) {
      try {
        if (settings.databasePath !== previousPath) {
          saveSettings({ ...settings, databasePath: previousPath, databaseInitialized: true });
        }
        await startBackend(previousPath);
        if (mainWindow) await mainWindow.loadURL(`http://127.0.0.1:${backendPort}/`);
      } catch (restartError) {
        await showError(`Falló el cambio y no se pudo reiniciar la base original.\n\n${restartError.message}`);
      }
    }
    await showError(`No se pudo cambiar la ubicación. La base original se conserva.\n\n${error.message}`);
    return { changed: false, canceled: false };
  } finally {
    isSwitchingDatabase = false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== `http://127.0.0.1:${backendPort}/`) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  return mainWindow.loadURL(`http://127.0.0.1:${backendPort}/`);
}

function installApplicationMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Cambiar ubicación de la base de datos…',
          click: () => void selectDatabaseLocation()
        },
        { type: 'separator' },
        { role: 'quit', label: 'Salir de LOGIXT' }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de LOGIXT',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'LOGIXT',
            message: 'LOGIXT — Sistema de Gestión y Logística',
            detail: 'Versión de escritorio con SQLite local.'
          })
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('desktop:get-database-location', () => settings?.databasePath || null);
ipcMain.handle('desktop:select-database-location', () => selectDatabaseLocation());

app.whenReady().then(async () => {
  if (!ownsSingleInstanceLock) return;
  try {
    settings = readSettings();
    jwtSecret = await loadJwtSecret();
    validateWritableDirectory(path.dirname(settings.databasePath));
    if (settings.databaseInitialized && !fs.existsSync(settings.databasePath)) {
      throw new Error('La base de datos configurada no está disponible. Conecta la unidad seleccionada; LOGIXT no creará una base vacía.');
    }
    if (fs.existsSync(settings.databasePath)) validateDatabase(settings.databasePath);

    if (!settings.port) {
      settings = { ...settings, port: await findAvailablePort() };
      saveSettings(settings);
    }

    await startBackend(settings.databasePath);
    if (!settings.databaseInitialized) {
      saveSettings({ ...settings, databaseInitialized: true });
    }
    installApplicationMenu();
    await createWindow();
  } catch (error) {
    await showError(`No se pudo iniciar LOGIXT Desktop. No se creó una base de reemplazo.\n\n${error.message}`);
    if (backendProcess) {
      try {
        await stopBackend();
      } catch (stopError) {
        await showError(`No se pudo cerrar el backend local de forma segura.\n\n${stopError.message}`);
        return;
      }
    }
    allowQuit = true;
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (allowQuit || !backendProcess) return;
  event.preventDefault();
  if (cleanupInProgress) return;
  cleanupInProgress = true;

  stopBackend().then(() => {
    allowQuit = true;
    app.quit();
  }).catch(async (error) => {
    cleanupInProgress = false;
    await dialog.showMessageBox({
      type: 'error',
      title: 'No se pudo cerrar SQLite de forma segura',
      message: error.message,
      detail: 'LOGIXT permanecerá abierto para evitar un cierre inseguro de la base de datos.',
      buttons: ['Volver a LOGIXT']
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && backendPort) {
    void createWindow();
  }
});
