# 📦 Sistema de Gestión y Logística de Almacén

Aplicación empresarial moderna para el control de inventario y logística interna de almacenes. Desarrollada con un enfoque prioritario en **rapidez operativa, simplicidad, control estricto de existencias y trazabilidad inmutable**.

---

## 🚀 Características Principales

- **📦 Dashboard de Almacén**:
  - Métricas KPI en tiempo real: Total de Productos, Existencias Totales, Stock Bajo y Agotados.
  - Tabla de inventario completa con buscador instantáneo (código interno, código de barras, QR, nombre, categoría, ubicación).
  - Filtros por estado: 🟢 Disponible, 🟡 Stock Bajo, 🔴 Agotado.
  - Feed en vivo de las últimas operaciones realizadas.

- **🏷️ Gestión de Productos y Etiquetas**:
  - Registro completo de productos con autogenerador de códigos QR únicos.
  - Ubicación física detallada por **Almacén**, **Pasillo**, **Estante** y **Nivel**.
  - Impresión de etiquetas para estantes y cajas con código de barras (Code128) y código QR nítido.

- **📷 Escáner de Códigos Ultrarrápido**:
  - **Cámara Web / Dispositivo Móvil**: Escaneo en tiempo real de códigos QR y códigos de barras (EAN-13, Code 128, etc.).
  - **Pistolas Lectoras USB / Bluetooth (Hardware Wedge)**: Listener global automático que detecta ráfagas de teclado y abre el producto sin necesidad de hacer clic en ningún campo.
  - **Ficha instantánea**: Muestra nombre, código, foto, stock disponible, ubicación física y estado.
  - Acciones en 1 clic: `[📥 Ingreso]` | `[📤 Despacho]` | `[⚖️ Ajuste]` | `[📋 Historial]`.
  - **Feedback sonoro**: Beeps de confirmación y advertencia mediante Web Audio API.

- **📥 Ingresos de Mercancía**:
  - Flujo ágil de recepción: Escanear → Cantidad → Proveedor/Guía → Confirmar.
  - `Stock actual + cantidad ingresada = nuevo stock`.
  - Transacción atómica e inserción inmediata en historial.

- **📤 Despacho de Mercancía**:
  - Control riguroso de salidas hacia áreas solicitantes (ej. Producción, Mantenimiento).
  - **Regla de oro**: El sistema bloquea automáticamente cualquier intento de despachar una cantidad superior al stock disponible.
  - `Stock actual - cantidad despachada = nuevo stock`.

- **⚖️ Ajustes de Inventario**:
  - Correcciones por conteo físico, producto dañado, merma o extravío.
  - Exige motivo justificado obligatorio y calcula la diferencia matemática.

- **📋 Historial de Movimientos**:
  - Registro inmutable de auditoría (no permite borrado de movimientos históricos).
  - Filtros por fechas, tipo (`INGRESO`, `DESPACHO`, `AJUSTE`), producto y usuario responsable.

- **⚠️ Alertas de Reposición**:
  - Detección automática de productos con stock en 0 o por debajo del stock mínimo.
  - Cálculo de unidades faltantes con botón directo para ingresar stock.

- **👥 Roles y Permisos**:
  - **ADMINISTRADOR**: Acceso total, altas/bajas de productos, ajustes manuales, gestión de usuarios.
  - **ALMACENERO**: Consultas, escaneo, ingresos, despachos y visualización de movimientos.

---

## 🔑 Credenciales de Acceso Iniciales

| Rol | Usuario | Contraseña | Capacidades |
| :--- | :--- | :--- | :--- |
| **Administrador** | `admin` | `admin123` | Control total, gestión de catálogo, ajustes y usuarios |
| **Almacenero** | `almacen` | `almacen123` | Escaneo, consultas, registro de ingresos y despachos |

> *En la pantalla de inicio de sesión también dispone de botones de "Acceso Rápido" para ingresar con 1 clic a cualquiera de las dos cuentas.*

---

## 🛠️ Tecnologías Utilizadas

- **Backend**:
  - Node.js 24 con motor de base de datos **`node:sqlite` nativo** (alto rendimiento, modo WAL, transacciones ACID).
  - Express.js con API REST modular.
  - Autenticación segura con **JWT** y contraseñas protegidas con **bcryptjs**.
- **Frontend**:
  - React 19 + TypeScript + Vite.
  - Tailwind CSS con paleta industrial limpia y de alto contraste.
  - Lucide React para iconografía logística.
  - `html5-qrcode` para lectura por cámara.
  - `jsbarcode` y `qrcode` para generación e impresión de etiquetas.

---

## 💻 Instrucciones para Ejecutar

### 1. Iniciar la Aplicación
Para ejecutar el servidor integrado que sirve tanto la API REST como la aplicación web lista para producción:

```bash
npm start
```
La aplicación estará disponible inmediatamente en:
👉 **`http://localhost:5000`**

Para publicar el frontend por separado en **Vercel** y conservar la API/SQLite en un servicio persistente de **Render**, sigue la [guía de despliegue](./DEPLOYMENT.md#opción-b-frontend-en-vercel-y-api-en-render-configuración-elegida-para-logixt). El login JWT existente se conserva durante la transición; las cuentas con correo pueden autenticarse con Firebase Email/Password tras verificar la dirección y vincularla de forma única con el usuario local. Los roles y datos SaaS siguen en SQLite hasta completar las fases de migración descritas en la guía.

### 2. Web/PWA y modo sin conexión

En un origen HTTPS (o `localhost` para desarrollo), la aplicación registra un service worker y puede instalarse como PWA. Tras una visita en línea, conserva los recursos de la aplicación y las respuestas GET autenticadas que se hayan consultado en ese navegador. Un usuario que ya inició sesión en ese dispositivo puede volver a abrir la aplicación sin conexión y consultar esos datos guardados.

Sin conexión se pueden registrar **ingresos, despachos y ajustes de inventario** únicamente para productos guardados localmente. Las operaciones quedan en una cola IndexedDB asociada al usuario y empresa; se envían al recuperar la conexión (si la sincronización automática está habilitada) o desde Almacenamiento → Sincronización. El servidor valida cada movimiento dentro de una transacción, registra un recibo idempotente y evita repetir operaciones tras fallos de red. Si el producto, los permisos o el stock cambiaron, la operación permanece en conflicto para revisión y reintento explícito.

La creación/edición/eliminación de productos y categorías, así como los demás cambios administrativos, todavía requieren conexión. No se permite operar offline si no existe una copia local del producto. La sincronización evita duplicados, pero no convierte el uso simultáneo de varios dispositivos en una edición colaborativa sin conflictos.

Los datos web se guardan en el almacenamiento privado del navegador (IndexedDB). La PWA no puede elegir libremente una carpeta o tarjeta SD para alojar una base SQLite activa.

#### Respaldos y restauración

Los respaldos son independientes de la cola de sincronización de movimientos. El respaldo manual del servidor contiene los datos que ya están en SQLite; antes de crearlo, sincroniza o resuelve las operaciones pendientes. La frecuencia guardada en la configuración no activa un programador: esta instalación ofrece respaldos manuales, el respaldo inicial de configuración y el preventivo previo a una restauración.

En web/PWA, **Exportar Copia Local** genera un archivo JSON con los datos de inventario disponibles en IndexedDB; si hay conexión, intenta actualizar primero el snapshot. La exportación se bloquea mientras existan movimientos pendientes y añade un checksum SHA-256. Si no hay conexión, el archivo puede reflejar solo los datos previamente descargados y estar desactualizado. El archivo JSON no está cifrado: guárdalo en una ubicación protegida.

**Importar Copia Local** valida el formato, la empresa y, cuando existe, el checksum. Reemplaza únicamente el inventario local de la empresa activa, de forma transaccional; no modifica el servidor y no se permite mientras haya operaciones pendientes. Esta acción y la eliminación/restauración de respaldos del servidor están reservadas a administradores. Los respaldos antiguos sin checksum pueden importarse, pero la interfaz advierte que no se pudo verificar criptográficamente su integridad. La restauración de un respaldo del servidor sigue siendo una operación diferente: requiere conexión, crea una copia preventiva y actualiza la copia local después de restaurar.

Google Drive permite conectar una cuenta por empresa y subir manualmente respaldos existentes. La autorización se realiza en el servidor con OAuth, state de un solo uso, PKCE y el scope mínimo `drive.file`. Los access/refresh tokens se cifran con AES-256-GCM antes de guardarse en SQLite; la clave nunca se envía al cliente. Las subidas validan el checksum y son idempotentes. La programación automática de respaldos sigue inactiva.

Desde **Copias guardadas en Google Drive** también se pueden listar, paginar y restaurar copias de LOGIXT. La restauración verifica que el archivo fue creado por LOGIXT para la empresa activa, valida su checksum y estructura, guarda una copia recuperable en el servidor, genera otra copia preventiva del estado actual y aplica la restauración por el flujo existente. Antes de probarla en producción, usa una empresa de prueba: la operación sustituye el inventario actual de esa empresa.

Para habilitarlo:

1. Cree un cliente OAuth de tipo aplicación web en Google Cloud y configure la pantalla de consentimiento.
2. Autorice únicamente `https://www.googleapis.com/auth/drive.file` y registre como redirect URI exacta `https://<dominio-api>/api/storage/google-drive/callback` (en desarrollo, use localhost).
3. Configure `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `CLIENT_URL` y `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` en el entorno del servidor. Genere la clave con `openssl rand -hex 32` y guárdela en el gestor de secretos del despliegue, nunca en el repositorio, cliente o chat.
4. Inicie sesión como administrador, conecte la cuenta de la empresa desde Almacenamiento y use el botón **Drive** en el respaldo que desea copiar.

La integración no se puede usar si faltan variables de entorno. La pérdida o sustitución de la clave de cifrado impide descifrar las conexiones existentes. Para rotarla sin perder acceso, desconecte las cuentas con la clave anterior activa, cambie la clave y vuelva a conectar; no reemplace la clave directamente. Los tokens no se exponen a la interfaz. Drive conserva una copia del respaldo del servidor; la restauración local o de servidor continúa siendo un flujo separado. Ningún acceso real a Google Drive se considera validado hasta configurar OAuth y probar con una cuenta de despliegue.

### 3. Versión de escritorio opcional (Electron)

Instala también las dependencias de escritorio y ejecuta:

```bash
npm install
npm run desktop
```

El comando compila el frontend, inicia el backend local y abre LOGIXT en Electron. SQLite conserva el esquema existente y, por defecto, se guarda en la carpeta de datos del usuario del sistema operativo. En **Archivo → Cambiar ubicación de la base de datos…** puedes elegir otra carpeta o unidad; LOGIXT valida la integridad, copia la base sin reemplazar el original y cambia de ubicación solo después de comprobar que la nueva copia abre correctamente. Si la unidad configurada no está disponible, la aplicación no crea silenciosamente una base vacía.

La API del escritorio escucha solo en `127.0.0.1`. El secreto JWT local se protege con el almacenamiento seguro del sistema cuando está disponible.

Para validar la migración local sin tocar la base de producción:

```bash
npm run desktop:test
```

Para validar la cola offline, idempotencia y permisos de respaldos usando una base SQLite temporal:

```bash
npm --prefix server run test:sync
```

Para probar OAuth, cifrado de tokens, permisos multiempresa y subidas a Drive simuladas sin acceder a una cuenta real:

```bash
npm --prefix server run test:google-drive
```

#### Validación manual antes de cerrar la Etapa 7

Las pruebas automatizadas no reemplazan las pruebas en dispositivos físicos. En una empresa de prueba, comprueba en Windows, Linux y macOS; en tabletas; y en Android/iPhone/iPad:

1. Instala/abre la PWA tras una visita online, cierra y vuelve a abrirla sin red; confirma que carga los recursos y datos previamente consultados.
2. Sin red, registra ingresos, despachos y ajustes permitidos; reconecta, sincroniza y confirma que cada movimiento aparece una sola vez. Reinicia y repite después de una pérdida de conexión durante la sincronización.
3. Exporta e importa una copia local; prueba un checksum manipulado y una copia de otra empresa. Confirma que ambas se rechazan sin sustituir los datos locales.
4. Con OAuth configurado, conecta Drive, sube, pagina y restaura un respaldo en la empresa de prueba; confirma el checksum, la copia preventiva, la recuperación local y la desconexión.
5. En Electron, cambia la base de datos a otra carpeta/unidad, reinicia y verifica integridad; repite con la unidad no disponible y confirma que los datos originales permanecen intactos.

Registra el sistema operativo, dispositivo/navegador, resultado y errores de cada caso antes de declarar la etapa terminada. Las pruebas físicas y una conexión real de Google no se pueden certificar desde las pruebas simuladas del repositorio.

### 4. Modo Desarrollo (Hot Reload)
Si desea trabajar con recarga rápida de Vite en el frontend:

```bash
# Terminal 1: Iniciar API Backend
cd server
npm start

# Terminal 2: Iniciar Servidor de Desarrollo Vite
cd client
npm run dev
```
La interfaz de desarrollo estará en:
👉 **`http://localhost:5173`**

### 5. Ejecutar Pruebas Automatizadas
Para verificar la integridad de la base de datos, las transacciones y las reglas de negocio:

```bash
npm run test:backend
# o para pruebas completas E2E:
node test_e2e.js
```
