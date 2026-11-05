-- Esquema de Base de Datos para Sistema de Gestión y Logística de Almacén (SaaS Multi-Tenant)
PRAGMA foreign_keys = ON;

-- 1. PLANES COMERCIALES
CREATE TABLE IF NOT EXISTS planes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  precio REAL NOT NULL,
  periodo TEXT DEFAULT 'MENSUAL',
  max_usuarios INTEGER NOT NULL DEFAULT 5,
  max_almacenes INTEGER NOT NULL DEFAULT 1,
  max_dispositivos INTEGER NOT NULL DEFAULT 1,
  caracteristicas TEXT,
  estado TEXT DEFAULT 'ACTIVO',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. EMPRESAS (TENANTS)
CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  telefono TEXT,
  logo TEXT,
  estado TEXT CHECK(estado IN ('ACTIVA', 'SUSPENDIDA', 'INACTIVA')) NOT NULL DEFAULT 'ACTIVA',
  plan_id INTEGER REFERENCES planes(id),
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. SUSCRIPCIONES
CREATE TABLE IF NOT EXISTS suscripciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES planes(id),
  estado TEXT CHECK(estado IN ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'SUSPENDED')) NOT NULL DEFAULT 'ACTIVE',
  fecha_inicio TEXT NOT NULL,
  fecha_proximo_pago TEXT NOT NULL,
  fecha_cancelacion TEXT,
  payment_customer_id TEXT,
  payment_subscription_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. PAGOS Y FACTURAS
CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  suscripcion_id INTEGER REFERENCES suscripciones(id),
  monto REAL NOT NULL,
  moneda TEXT DEFAULT 'USD',
  estado TEXT CHECK(estado IN ('PAGADO', 'FALLIDO', 'PENDIENTE')) NOT NULL DEFAULT 'PAGADO',
  payment_id TEXT UNIQUE,
  metodo_pago TEXT DEFAULT 'TARJETA',
  fecha_pago DATETIME DEFAULT CURRENT_TIMESTAMP,
  comprobante_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. CONFIGURACIÓN GLOBAL SAAS
CREATE TABLE IF NOT EXISTS configuracion_saas (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- 6. AUDITORÍA DE WEBHOOKS
CREATE TABLE IF NOT EXISTS webhook_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evento TEXT NOT NULL,
  proveedor TEXT DEFAULT 'GATEWAY_PAGOS',
  payload TEXT NOT NULL,
  procesado INTEGER DEFAULT 1,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. USUARIOS (Soporta rol SUPERADMIN de plataforma y usuarios por empresa)
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellido TEXT,
  usuario TEXT UNIQUE NOT NULL,
  contrasena_hash TEXT NOT NULL,
  firebase_uid TEXT,
  rol TEXT CHECK(rol IN ('SUPERADMIN', 'ADMINISTRADOR', 'ALMACENERO')) NOT NULL,
  email TEXT,
  telefono TEXT,
  foto TEXT,
  tema TEXT DEFAULT 'logixt',
  color_acento TEXT DEFAULT 'purple',
  almacenamiento_configurado INTEGER DEFAULT 0,
  almacenamiento_modo TEXT DEFAULT 'LOCAL_SYNC',
  estado TEXT CHECK(estado IN ('ACTIVO', 'INACTIVO')) DEFAULT 'ACTIVO',
  empresa_id INTEGER REFERENCES empresas(id),
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. CATEGORÍAS (Por Empresa)
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  prefijo TEXT,
  imagen TEXT,
  empresa_id INTEGER REFERENCES empresas(id)
);

-- 9. PRODUCTOS (Por Empresa)
CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  codigo_barras TEXT,
  codigo_qr TEXT NOT NULL,
  nombre TEXT NOT NULL,
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  descripcion TEXT,
  unidad_medida TEXT DEFAULT 'Unidades',
  stock_actual INTEGER NOT NULL DEFAULT 0 CHECK(stock_actual >= 0),
  stock_minimo INTEGER NOT NULL DEFAULT 5,
  ubicacion_almacen TEXT DEFAULT 'Almacén Principal',
  ubicacion_pasillo TEXT,
  ubicacion_estante TEXT,
  ubicacion_nivel TEXT,
  imagen TEXT,
  proveedor TEXT,
  empresa_id INTEGER REFERENCES empresas(id),
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. MOVIMIENTOS DE ALMACÉN (Inmutables por Empresa)
CREATE TABLE IF NOT EXISTS movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  tipo TEXT CHECK(tipo IN ('INGRESO', 'DESPACHO', 'AJUSTE')) NOT NULL,
  cantidad INTEGER NOT NULL,
  stock_anterior INTEGER NOT NULL,
  stock_nuevo INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  observacion TEXT,
  destino TEXT,
  motivo_ajuste TEXT,
  guia_despacho TEXT,
  responsable_recepcion TEXT,
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  empresa_id INTEGER REFERENCES empresas(id),
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 11. DISPOSITIVOS VINCULADOS (Por Empresa)
CREATE TABLE IF NOT EXISTS dispositivos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo TEXT CHECK(tipo IN ('Tablet', 'PC', 'Laptop', 'Otro')) NOT NULL DEFAULT 'PC',
  sistema_operativo TEXT,
  version_logixt TEXT DEFAULT 'v1.0.4',
  estado TEXT CHECK(estado IN ('ACTIVO', 'PENDIENTE', 'BLOQUEADO', 'DESACTIVADO')) NOT NULL DEFAULT 'PENDIENTE',
  codigo_activacion TEXT UNIQUE,
  codigo_expiracion DATETIME,
  fecha_activacion DATETIME,
  ultima_conexion DATETIME,
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
  creado_por_usuario_id INTEGER REFERENCES usuarios(id)
);

-- 12. LOGS DE ACTIVIDAD Y AUDITORÍA GLOBAL
CREATE TABLE IF NOT EXISTS actividad_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER REFERENCES usuarios(id),
  usuario_nombre TEXT,
  empresa_id INTEGER REFERENCES empresas(id),
  empresa_nombre TEXT,
  accion TEXT NOT NULL,
  detalles TEXT,
  ip_origen TEXT,
  fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 13. CONFIGURACIÓN DE ALMACENAMIENTO Y SINCRONIZACIÓN (Por Usuario / Empresa / Dispositivo)
CREATE TABLE IF NOT EXISTS configuracion_almacenamiento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
  dispositivo_uuid TEXT NOT NULL,
  modo TEXT CHECK(modo IN ('LOCAL_SYNC', 'CLOUD_MANAGED')) NOT NULL DEFAULT 'LOCAL_SYNC',
  tipo_almacenamiento_local TEXT CHECK(tipo_almacenamiento_local IN ('DIRECTORIO_LOCAL', 'OPFS', 'INDEXEDDB')) DEFAULT 'INDEXEDDB',
  nombre_carpeta_local TEXT,
  ruta_local_referencia TEXT,
  auto_sincronizar INTEGER DEFAULT 1,
  frecuencia_respaldo TEXT CHECK(frecuencia_respaldo IN ('MANUAL', 'HORARIA', 'DIARIA', 'SEMANAL', 'TIEMPO_REAL')) DEFAULT 'DIARIA',
  cifrado_activo INTEGER DEFAULT 1,
  estado_sincronizacion TEXT CHECK(estado_sincronizacion IN ('SINCRONIZADO', 'PENDIENTE', 'SINCRONIZANDO', 'ERROR', 'DESCONECTADO')) DEFAULT 'SINCRONIZADO',
  ultimo_respaldo DATETIME,
  proximo_respaldo DATETIME,
  ultimo_error TEXT,
  bytes_utilizados_local INTEGER DEFAULT 0,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(usuario_id, dispositivo_uuid)
);

-- 14. RESPALDOS Y COPIAS DE SEGURIDAD (Multi-Tenant)
CREATE TABLE IF NOT EXISTS respaldos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  dispositivo_uuid TEXT,
  tipo TEXT CHECK(tipo IN ('MANUAL', 'AUTOMATICO', 'PREVENTIVO')) NOT NULL DEFAULT 'MANUAL',
  nombre_archivo TEXT NOT NULL,
  ruta_archivo TEXT NOT NULL,
  tamano_bytes INTEGER NOT NULL DEFAULT 0,
  checksum_sha256 TEXT NOT NULL,
  total_productos INTEGER DEFAULT 0,
  total_movimientos INTEGER DEFAULT 0,
  total_categorias INTEGER DEFAULT 0,
  estado TEXT CHECK(estado IN ('COMPLETADO', 'ERROR', 'RESTAURADO')) DEFAULT 'COMPLETADO',
  detalles TEXT,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 15. AUDITORÍA DE SINCRONIZACIÓN (Logs de Sincronización)
CREATE TABLE IF NOT EXISTS sincronizacion_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id),
  dispositivo_uuid TEXT,
  tipo_operacion TEXT CHECK(tipo_operacion IN ('SUBIDA', 'DESCARGA', 'CONFLICTO_RESUELTO', 'RESTORE')) NOT NULL,
  entidad TEXT NOT NULL,
  registros_afectados INTEGER DEFAULT 0,
  estado TEXT CHECK(estado IN ('EXITOSO', 'FALLIDO', 'EN_PROGRESO')) DEFAULT 'EXITOSO',
  detalles TEXT,
  fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Recibos idempotentes para operaciones offline; se conservan para evitar duplicados al reintentar.
CREATE TABLE IF NOT EXISTS sync_mutation_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  sync_id TEXT NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  dispositivo_uuid TEXT NOT NULL,
  status TEXT CHECK(status IN ('APPLIED', 'CONFLICT')) NOT NULL,
  result_json TEXT NOT NULL,
  fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(empresa_id, sync_id)
);

-- Conexión OAuth de Google Drive: los tokens siempre se guardan cifrados.
CREATE TABLE IF NOT EXISTS google_drive_connections (
  empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  scope TEXT NOT NULL,
  fecha_conexion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- State OAuth de un solo uso, vinculado al usuario y empresa que iniciaron el flujo.
CREATE TABLE IF NOT EXISTS google_drive_oauth_states (
  state_hash TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  code_verifier_encrypted TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS google_drive_backup_uploads (
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  backup_id INTEGER NOT NULL REFERENCES respaldos(id) ON DELETE CASCADE,
  google_file_id TEXT,
  google_file_name TEXT,
  checksum_sha256 TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  fecha_subida TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado TEXT NOT NULL CHECK(estado IN ('SUBIENDO', 'COMPLETADO')),
  PRIMARY KEY (empresa_id, backup_id)
);

CREATE INDEX IF NOT EXISTS idx_google_drive_oauth_states_expiry
  ON google_drive_oauth_states(expires_at);

-- Índices de Rendimiento y Aislamiento Multi-Tenant
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_categorias_empresa ON categorias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_productos_empresa ON productos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_empresa ON movimientos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_suscripciones_empresa ON suscripciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pagos_empresa ON pagos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_dispositivos_empresa ON dispositivos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_dispositivos_codigo ON dispositivos(codigo_activacion);
CREATE INDEX IF NOT EXISTS idx_actividad_empresa ON actividad_logs(empresa_id);
CREATE INDEX IF NOT EXISTS idx_actividad_fecha ON actividad_logs(fecha_hora);
CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(empresa_id, codigo);
CREATE INDEX IF NOT EXISTS idx_productos_codigo_barras ON productos(empresa_id, codigo_barras);
CREATE INDEX IF NOT EXISTS idx_productos_codigo_qr ON productos(empresa_id, codigo_qr);
CREATE INDEX IF NOT EXISTS idx_config_almacenamiento_user ON configuracion_almacenamiento(usuario_id);
CREATE INDEX IF NOT EXISTS idx_config_almacenamiento_empresa ON configuracion_almacenamiento(empresa_id);
CREATE INDEX IF NOT EXISTS idx_respaldos_empresa ON respaldos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_respaldos_fecha ON respaldos(fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_sync_logs_empresa ON sincronizacion_logs(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sync_receipts_empresa_fecha ON sync_mutation_receipts(empresa_id, fecha_hora);
