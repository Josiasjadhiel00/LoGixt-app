# 🚀 LOGIXT — Guía de Despliegue y Puesta en Producción

LOGIXT es una plataforma SaaS integral para la gestión y logística inteligente de almacenes con arquitectura multiempresa (multi-tenant), control de planes, facturación simulada, perfiles personalizados y aprovisionamiento seguro de dispositivos.

Esta guía documenta los requisitos, configuraciones, procedimientos de despliegue y estrategias de mantenimiento para llevar LOGIXT a un entorno de producción web en Internet.

---

## 📋 1. Requisitos Previos

- **Node.js**: Versión 22.x LTS o superior (requerido para soporte nativo de `node:sqlite`).
- **NPM**: Versión 10.x o superior.
- **Memoria RAM recomendada**: Mínimo 1 GB de RAM (2 GB recomendado para compilación y backups).
- **Almacenamiento**: Disco de estado sólido (SSD) con soporte de persistencia (crucial para SQLite).
- **Dominio y Certificado SSL**: Dominio registrado con HTTPS (Let's Encrypt / Cloudflare).

---

## ⚙️ 2. Variables de Entorno (`server/.env`)

Antes de iniciar en producción, configure el archivo de entorno en el servidor (`server/.env`).

> ⚠️ **IMPORTANTE DE SEGURIDAD**: Nunca use valores por defecto como `CAMBIAR_EN_PRODUCCION` en producción. El servidor cuenta con protecciones automáticas y se negará a iniciar si detecta una clave insegura.

### Plantilla de Configuración de Producción

```env
# Entorno de ejecución (development | production)
NODE_ENV=production

# Puerto HTTP en el que escuchará el servidor Express
PORT=5000

# URL pública del cliente autorizada por CORS (dominio de producción con https)
CLIENT_URL=https://logixt.tu-dominio.com

# Secreto criptográfico robusto para firma y verificación de JWT (mínimo 32 caracteres)
# Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=f9a8c1e274b3d84a6c9e0f31528b74a1d9c2e5f8a0b3c6d9e2f5a8b1c4d7e0f3

# Ruta del archivo SQLite (por defecto en server/database.sqlite)
# En contenedores o servicios PaaS con volumen montado, apunte al volumen persistente
DB_PATH=database.sqlite

# Sembrado de datos de demostración (false en producción)
SEED_DEMO_DATA=false

# Contraseña inicial para el SuperAdmin al iniciar por primera vez
# Si se omite, se generará una contraseña aleatoria de un solo uso en consola
SUPERADMIN_INITIAL_PASSWORD=MiContrasenaSegura2026!
```

---

## 🛠️ 3. Comandos de Instalación y Compilación

En el directorio raíz del proyecto:

```bash
# 1. Instalar dependencias completas del backend y frontend
npm run install:all

# 2. Compilar el cliente React + Vite para producción
# Esto genera el bundle optimizado en client/dist/
npm run build

# 3. Iniciar el servidor Express unificado
npm start
```

### Arquitectura de Entrega Integrada

- El servidor Node.js/Express sirve directamente la API REST en `/api/*`.
- Los archivos estáticos optimizados (`client/dist/`) se sirven en la raíz `/`.
- Todas las rutas del frontend SPA (como `/dispositivos`, `/inventario`, `/empresas`) redirigen limpiamente al `index.html` de React Router.
- Las solicitudes no válidas dentro del espacio `/api/*` devuelven respuestas de error JSON 404 estructuradas.

---

## 🌐 4. Opciones de Despliegue

### Opción A: Servidor Linux / VPS (Ubuntu/Debian) con PM2 y Nginx

Esta es la opción recomendada para máximo rendimiento y control directo de SQLite.

#### 1. Configurar PM2 (Process Manager)

Instale PM2 globalmente:
```bash
npm install -g pm2
```

Cree un archivo de configuración `ecosystem.config.cjs` en la raíz del proyecto:
```javascript
module.exports = {
  apps: [{
    name: 'logixt-saas',
    script: 'server/src/app.js',
    instances: 1, // Mantener 1 instancia para bases de datos SQLite
    autorestart: true,
    watch: false,
    max_memory_restart: '800M',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    }
  }]
};
```

Inicie la aplicación con PM2:
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

#### 2. Configurar Nginx como Proxy Inverso

Cree la configuración en `/etc/nginx/sites-available/logixt`:
```nginx
server {
    server_name logixt.tu-dominio.com;

    # Tamaño máximo de subida para fotos y archivos
    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Habilite el sitio y aplique SSL gratuito:
```bash
sudo ln -s /etc/nginx/sites-available/logixt /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d logixt.tu-dominio.com
```

---

### Opción B: Frontend en Vercel y API en Render (configuración elegida para LOGIXT)

El frontend React/Vite se publica como sitio estático en Vercel. La API Express y SQLite se ejecutan juntas en un Web Service de Render con un disco persistente. **No despliegue la API como función serverless de Vercel**: `node:sqlite`, el modo WAL y los archivos JSON de respaldo necesitan almacenamiento persistente.

#### 1. Publicar la API en Render

1. Cree un **Web Service** desde el repositorio privado `Josiasjadhiel00/LoGixt-app` y autorice su acceso a GitHub.
2. Seleccione Node como runtime, la rama `main` y el directorio raíz `server`.
3. Use `npm ci` como comando de instalación y `npm start` como comando de inicio. Seleccione Node **24.x** o superior compatible con `node:sqlite`.
4. Añada un **Persistent Disk** montado en `/var/data`. La base de datos y los respaldos no deben quedar en el filesystem efímero del servicio.
5. Configure en **Environment**:

   | Variable | Valor |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `CLIENT_URL` | `https://lo-gixt-app.vercel.app` |
   | `DB_PATH` | `/var/data/database.sqlite` |
   | `BACKUPS_DIR` | `/var/data/backups` |
   | `SEED_DEMO_DATA` | `false` |
   | `JWT_SECRET` | Secreto aleatorio nuevo generado para producción; nunca reutilizar el ejemplo |
   | `SUPERADMIN_INITIAL_PASSWORD` | Contraseña inicial fuerte si la instalación aún necesita crear el SuperAdmin |
   | `FIREBASE_PROJECT_ID` | `logixt-59b8c` |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | JSON privado de una cuenta de servicio del proyecto Firebase; guardarlo solo como secreto de Render |

   Render asigna `PORT`; no fijes el puerto a un valor local. Mantén una sola instancia de la API para SQLite. Guarda todos los valores en el panel de Render, no en GitHub.
6. Despliega y comprueba `https://logixt-api.onrender.com/api/health`. Debe responder `200` y `"database":"connected"`.

#### 2. Publicar el frontend en Vercel

1. Importa el mismo repositorio privado `Josiasjadhiel00/LoGixt-app` en Vercel.
2. Configura **Root Directory** como `client`; deja el framework en Vite. El build es `npm run build` y el directorio de salida `dist`.
3. Configure estas variables públicas de Firebase en **Production**:

   | Variable | Valor |
   | --- | --- |
   | `VITE_API_URL` | `https://logixt-api.onrender.com/api` |
   | `VITE_FIREBASE_API_KEY` | La clave pública de la aplicación web Firebase |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `logixt-59b8c.firebaseapp.com` |
   | `VITE_FIREBASE_PROJECT_ID` | `logixt-59b8c` |
   | `VITE_FIREBASE_APP_ID` | El ID público de la aplicación web Firebase |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | El ID público del remitente Firebase |
   | `VITE_FIREBASE_STORAGE_BUCKET` | `logixt-59b8c.firebasestorage.app` |
   | `VITE_WHATSAPP_NUMBER` | Número comercial de WhatsApp en formato internacional, solo dígitos; por ejemplo `18494259671` |

   La configuración de Firebase Web y el número de WhatsApp de atención son públicos y se incorporan al bundle; no añada la cuenta de servicio ni claves privadas a Vercel. La URL de API también tiene un valor predeterminado en el cliente, pero puede sobreescribirse con `VITE_API_URL`.
4. Abre la URL de producción, inicia sesión y verifica lectura/escritura, creación y descarga de respaldos, y la consola de red del navegador.

#### 3. CORS y dominio

`CLIENT_URL` debe coincidir exactamente con `https://lo-gixt-app.vercel.app` e incluir `https://` sin una ruta como `/login`. El backend solo permite ese origen en producción; las URLs Preview de Vercel no quedan habilitadas automáticamente. Para probar previews, usa un entorno de staging de API y configura allí el origen preview correspondiente; no abras CORS a cualquier dominio.

#### 4. Datos y autenticación actuales

La autenticación admite una transición gradual: se conserva el login existente de usuario/contraseña con JWT, y las cuentas con correo se autentican mediante Firebase Email/Password. El backend verifica el ID token con Firebase Admin, exige correo verificado y vincula la identidad por un correo coincidente y no ambiguo; los roles y la empresa siguen leyéndose desde SQLite durante esta etapa. No se migran hashes de contraseña a Firebase. Antes de habilitar el acceso Firebase, configure la cuenta de servicio privada en Render y asegure que cada correo de la base corresponde a una cuenta Firebase verificada. Las operaciones de usuarios/empresas todavía no se han migrado a Firestore.

Los pagos se gestionan manualmente por WhatsApp: el botón de suscripción abre un mensaje prellenado para solicitar los datos de cuenta y enviar el comprobante. Configura `VITE_WHATSAPP_NUMBER` en Vercel con el número comercial internacional, solo dígitos. La renovación requiere confirmación manual; `/api/webhooks/payments`, `/api/webhooks/simulate` y `/api/subscriptions/simulate-payment` siguen respondiendo `503` con `PAYMENTS_DISABLED` y no renuevan ni reactivan suscripciones automáticamente.

No importes `server/.env`, `database.sqlite`, sus archivos WAL, ni respaldos a GitHub. Para conservar datos locales, genera y valida una copia consistente de la base y planifica una transferencia segura al disco persistente de Render antes de abrir la aplicación al público. No empieces con una base vacía si necesitas conservar empresas, usuarios e inventario; los snapshots JSON por empresa no sustituyen por sí solos a una migración de toda la base SaaS.

#### 5. Google Drive

La conexión Drive se configura solo en Render, no en Vercel. Añade allí `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` y el `CLIENT_URL` HTTPS final. Registra como callback OAuth la URL exacta `https://<servicio>.onrender.com/api/storage/google-drive/callback`. Mantén las variables vacías hasta haber creado y configurado la aplicación OAuth en Google Cloud.

### Opción C: Despliegue en otros PaaS (Railway, Fly.io)

Si despliega en otra plataforma PaaS, mantenga la API en un servicio Node persistente y cree un volumen para SQLite y respaldos. Configure `DB_PATH` y `BACKUPS_DIR` con rutas absolutas dentro del volumen. No use el filesystem efímero ni más de una instancia escribiendo en el mismo archivo SQLite.

---

### Opción D: Despliegue con Docker y Docker Compose

Si prefiere ejecutar mediante contenedores Docker:

#### `Dockerfile`
```dockerfile
FROM node:22-alpine

WORKDIR /app

# Copiar definiciones de dependencias
COPY package.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Instalar dependencias
RUN npm run install:all

# Copiar código fuente
COPY . .

# Compilar frontend
RUN npm run build

# Crear directorio de persistencia y backups
RUN mkdir -p /app/data /app/server/backups

ENV NODE_ENV=production
ENV PORT=5000
ENV DB_PATH=/app/data/database.sqlite

EXPOSE 5000

CMD ["npm", "start"]
```

#### `docker-compose.yml`
```yaml
version: '3.8'

services:
  logixt:
    build: .
    restart: always
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
      - CLIENT_URL=https://logixt.tu-dominio.com
      - JWT_SECRET=CAMBIAR_POR_SECRETO_SEGURO_EN_PRODUCCION
      - DB_PATH=/app/data/database.sqlite
      - SEED_DEMO_DATA=false
    volumes:
      - logixt_data:/app/data
      - logixt_backups:/app/server/backups

volumes:
  logixt_data:
  logixt_backups:
```

---

## 🗄️ 5. Manejo de SQLite en Producción y Estrategia de Backups

LOGIXT utiliza la librería nativa de alto rendimiento `node:sqlite` con modo WAL (Write-Ahead Logging) habilitado para soportar múltiples lectores concurrentes y un escritor seguro.

### Modo WAL y Checkpoints

La conexión de base de datos activa automáticamente:
- `PRAGMA journal_mode = WAL;` (Lecturas concurrentes ultrarrápidas sin bloquear escrituras).
- `PRAGMA synchronous = NORMAL;` (Óptimo balance de rendimiento e integridad ante cortes de energía).
- `PRAGMA foreign_keys = ON;` (Integridad referencial estricta multi-tenant).

### Copia de Seguridad Automatizada

El proyecto incluye un script de respaldo seguro que ejecuta un checkpoint `TRUNCATE` en caliente antes de copiar el archivo:

```bash
# Ejecutar copia de seguridad manual
npm run backup
```

Los respaldos se almacenan automáticamente en `server/backups/` con estampas de tiempo:
`database-backup-YYYY-MM-DD_HH-mm-ss.sqlite`.

#### Automatizar Copias Diarias con Cron (Linux)

Ejecute `crontab -e` y agregue una tarea programada diaria (ej. a las 03:00 AM):

```bash
0 3 * * * cd /ruta/al/proyecto && /usr/bin/npm run backup >> /ruta/al/proyecto/server/backups/cron.log 2>&1
```

---

## 💓 6. Monitoreo de Salud (`/api/health`)

El sistema expone un endpoint público de monitoreo compatible con UptimeRobot, Better Uptime, Datadog o Kubernetes liveness/readiness probes:

- **Endpoint**: `GET /api/health`
- **Respuesta de ejemplo (200 OK)**:
```json
{
  "status": "online",
  "ok": true,
  "system": "Logixt SaaS",
  "environment": "production",
  "version": "2.0.0",
  "database": "connected",
  "uptime": 86420,
  "timestamp": "2026-10-07T14:40:00.000Z"
}
```

---

## 🔄 7. Migración Futura a PostgreSQL (Escalado Horizontal)

Para empresas con miles de transacciones por segundo o arquitecturas multi-servidor detrás de un balanceador de carga:

1. **Capa de Abstracción**: El modelo de datos de LOGIXT utiliza SQL estándar estructurado sin dependencias propietarias de SQLite en sus tablas.
2. **Tablas Base**:
   - `empresas`, `planes`, `suscripciones`, `pagos`, `usuarios`, `categorias`, `productos`, `movimientos`, `dispositivos`, `actividad_logs`, `configuracion_saas`, `webhook_logs`.
3. **Paso a PostgreSQL**: Reemplazar `node:sqlite` en `server/src/db/connection.js` por un pool de conexiones `pg` o un ORM ligero, mapeando los tipos `INTEGER PRIMARY KEY AUTOINCREMENT` a `SERIAL` o `BIGSERIAL`, y `DATETIME` a `TIMESTAMPTZ`.
4. El aislamiento multiempresa por `empresa_id` ya está completamente implementado y auditado en todos los controladores y queries de LOGIXT.

---

## ✅ Lista de Verificación Pre-Lanzamiento (Pre-flight Checklist)

- [x] Variables de entorno configuradas (`.env` generado desde `.env.example`).
- [x] `JWT_SECRET` generado con 32+ caracteres aleatorios seguros.
- [x] `NODE_ENV=production` activado.
- [x] `CLIENT_URL` configurado con el dominio HTTPS real.
- [x] Frontend compilado con `npm run build` sin errores TypeScript.
- [x] Persistencia de SQLite garantizada en almacenamiento no efímero.
- [x] Tarea programada de backups (`npm run backup`) configurada en cron.
- [x] Monitoreo de salud apuntando a `/api/health`.
- [x] Credenciales iniciales del SuperAdmin respaldadas con seguridad.
