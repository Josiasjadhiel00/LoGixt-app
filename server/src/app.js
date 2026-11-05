import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import db from './db/connection.js';
import { seedDatabase } from './db/seed.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import productRoutes from './routes/products.js';
import movementRoutes from './routes/movements.js';
import categoryRoutes from './routes/categories.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import subscriptionRoutes from './routes/subscriptions.js';
import webhookRoutes from './routes/webhooks.js';
import deviceRoutes from './routes/devices.js';
import storageRoutes from './routes/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST;
const isProd = process.env.NODE_ENV === 'production';

// Asegurar datos iniciales y migraciones
try {
  seedDatabase();
} catch (err) {
  console.error('Aviso durante verificación de semilla de base de datos:', err.message);
}

// Configuración dinámica y segura de CORS
const clientUrl = process.env.CLIENT_URL;
const allowedOrigins = isProd
  ? [clientUrl].filter(Boolean)
  : [
      clientUrl,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5000',
      'http://127.0.0.1:5000'
    ].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origin (como herramientas internas, llamadas locales, o same-origin al servir la SPA)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // En desarrollo permitir cualquier localhost
    if (!isProd && origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));

app.use(express.json());

// Endpoint de comprobación de salud del sistema (Health Check)
app.get('/api/health', (req, res) => {
  let dbStatus = 'connected';
  try {
    const check = db.prepare('SELECT 1 as alive').get();
    if (!check || check.alive !== 1) {
      dbStatus = 'unhealthy';
    }
  } catch (err) {
    dbStatus = 'disconnected';
  }

  res.json({
    status: 'online',
    ok: true,
    system: 'Logixt SaaS',
    environment: process.env.NODE_ENV || 'development',
    version: '2.0.0',
    database: dbStatus,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Rutas de API REST
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/products', productRoutes);
app.use('/api/movements', movementRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/storage', storageRoutes);

// Servir frontend compilado en producción (si existe client/dist)
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));

  // Manejador de rutas SPA (React Router / HTML5 History API)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// 404 para cualquier ruta bajo /api/* no encontrada
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: `Endpoint no encontrado: ${req.originalUrl}`,
    path: req.originalUrl
  });
});

// Manejador global de errores seguro para producción
app.use((err, req, res, next) => {
  console.error('Error no controlado en la aplicación:', err);
  res.status(500).json({
    error: 'Error interno del servidor.',
    ...(isProd ? {} : { details: err.message })
  });
});

// Iniciar servidor
const server = HOST ? app.listen(PORT, HOST, onServerStarted) : app.listen(PORT, onServerStarted);

function onServerStarted() {
  console.log(`====================================================`);
  console.log(`📦 LOGIXT — Sistema SaaS de Gestión y Logística`);
  console.log(`🚀 Servidor backend activo en puerto: ${server.address().port}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`====================================================`);
  if (process.send) {
    process.send({ type: 'server-ready', port: server.address().port });
  }
}

if (process.send) {
  process.on('message', (message) => {
    if (message?.type !== 'shutdown') return;

    server.close((serverError) => {
      if (serverError) {
        process.send({ type: 'shutdown-error', message: serverError.message });
        return;
      }

      try {
        const checkpoint = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
        if (checkpoint?.busy) {
          throw new Error('SQLite no pudo completar el checkpoint WAL.');
        }
        db.close();
        process.send({ type: 'shutdown-complete' });
        process.disconnect();
      } catch (error) {
        process.send({ type: 'shutdown-error', message: error.message });
      }
    });
  });
}

export default app;
