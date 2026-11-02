export type UserRole = 'SUPERADMIN' | 'ADMINISTRADOR' | 'ALMACENERO';
export type UserStatus = 'ACTIVO' | 'INACTIVO';
export type ProductStatus = 'DISPONIBLE' | 'STOCK BAJO' | 'AGOTADO';
export type MovementType = 'INGRESO' | 'DESPACHO' | 'AJUSTE';
export type EmpresaStatus = 'ACTIVA' | 'SUSPENDIDA' | 'INACTIVA';
export type SubscriptionStatus = 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';
export type PaymentStatus = 'PAGADO' | 'FALLIDO' | 'PENDIENTE';
export type DeviceType = 'Tablet' | 'PC' | 'Laptop' | 'Otro';
export type DeviceStatus = 'ACTIVO' | 'PENDIENTE' | 'BLOQUEADO' | 'DESACTIVADO';
export type ThemeType = 'logixt' | 'dark' | 'light';
export type AccentColor = 'purple' | 'blue' | 'green' | 'orange' | 'red';
export type StorageMode = 'LOCAL_SYNC' | 'CLOUD_MANAGED';
export type LocalStorageType = 'DIRECTORIO_LOCAL' | 'OPFS' | 'INDEXEDDB';
export type BackupFrequency = 'MANUAL' | 'HORARIA' | 'DIARIA' | 'SEMANAL' | 'TIEMPO_REAL';
export type SyncStatus = 'SINCRONIZADO' | 'PENDIENTE' | 'SINCRONIZANDO' | 'ERROR' | 'DESCONECTADO';

export interface User {
  id: number;
  nombre: string;
  apellido?: string | null;
  usuario: string;
  rol: UserRole;
  estado: UserStatus;
  email?: string | null;
  telefono?: string | null;
  foto?: string | null;
  tema?: ThemeType;
  color_acento?: AccentColor;
  almacenamiento_configurado?: boolean;
  almacenamiento_modo?: StorageMode;
  empresa_id?: number | null;
  empresa_nombre?: string | null;
  empresa_estado?: EmpresaStatus | null;
  suscripcion_estado?: SubscriptionStatus | null;
  plan_nombre?: string | null;
  fecha_creacion?: string;
}

export interface Plan {
  id: number;
  codigo: string;
  nombre: string;
  precio: number;
  periodo: string;
  max_usuarios: number;
  max_almacenes: number;
  max_dispositivos: number;
  caracteristicas: string[] | string;
  estado?: string;
}

export interface Dispositivo {
  id: number;
  uuid: string;
  nombre: string;
  empresa_id: number;
  empresa_nombre?: string;
  tipo: DeviceType;
  sistema_operativo?: string | null;
  version_logixt: string;
  estado: DeviceStatus;
  codigo_activacion?: string | null;
  codigo_expiracion?: string | null;
  fecha_activacion?: string | null;
  ultima_conexion?: string | null;
  fecha_registro: string;
}

export interface ActividadLog {
  id: number;
  usuario_id?: number | null;
  usuario_nombre?: string | null;
  empresa_id?: number | null;
  empresa_nombre?: string | null;
  accion: string;
  detalles?: string | null;
  ip_origen?: string | null;
  fecha_hora: string;
}

export interface Empresa {
  id: number;
  nombre: string;
  email: string;
  telefono?: string | null;
  logo?: string | null;
  estado: EmpresaStatus;
  plan_id: number;
  plan_codigo?: string;
  plan_nombre?: string;
  plan_precio?: number;
  suscripcion_id?: number;
  suscripcion_estado?: SubscriptionStatus;
  fecha_inicio?: string;
  fecha_proximo_pago?: string;
  total_usuarios?: number;
  total_productos?: number;
  total_movimientos?: number;
  total_dispositivos?: number;
  fecha_creacion?: string;
}

export interface Suscripcion {
  id: number;
  empresa_id: number;
  empresa_nombre?: string;
  empresa_email?: string;
  empresa_estado?: EmpresaStatus;
  plan_id: number;
  plan_codigo?: string;
  plan_nombre?: string;
  plan_precio?: number;
  max_dispositivos?: number;
  dispositivos_activos?: number;
  estado: SubscriptionStatus;
  fecha_inicio: string;
  fecha_proximo_pago: string;
  fecha_cancelacion?: string | null;
  payment_customer_id?: string | null;
  payment_subscription_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Pago {
  id: number;
  empresa_id: number;
  empresa_nombre?: string;
  plan_nombre?: string;
  suscripcion_id?: number | null;
  monto: number;
  moneda: string;
  estado: PaymentStatus;
  payment_id: string;
  metodo_pago?: string;
  fecha_pago: string;
  comprobante_url?: string | null;
}

export interface SaaSMetrics {
  total_empresas: number;
  empresas_activas: number;
  empresas_suspendidas: number;
  empresas_inactivas: number;
  suscripciones_activas?: number;
  pagos_pendientes?: number;
  empresas_past_due: number;
  mrr: number;
  proximas_a_vencer: number;
  total_usuarios: number;
  total_productos: number;
  total_movimientos: number;
  dias_periodo_gracia: number;
  // Dispositivos
  total_dispositivos?: number;
  dispositivos_activos?: number;
  dispositivos_pendientes?: number;
  dispositivos_bloqueados?: number;
  tablets_count?: number;
  pcs_count?: number;
  laptops_count?: number;
  otros_count?: number;
}

export interface AnalyticsCharts {
  ingresos_mensuales: { mes: string; label: string; total: number }[];
  distribucion_suscripciones: { estado: string; count: number }[];
  distribucion_dispositivos: { tipo: string; count: number; color: string }[];
  crecimiento_empresas: { mes: string; label: string; nuevas: number }[];
}

export interface WebhookLog {
  id: number;
  evento: string;
  proveedor: string;
  payload: string;
  procesado: number;
  error?: string | null;
  created_at: string;
}

export interface Category {
  id: number;
  nombre: string;
  descripcion?: string | null;
  prefijo?: string | null;
  imagen?: string | null;
  empresa_id?: number;
  total_productos?: number;
  total_unidades?: number;
  productos_alerta?: number;
}

export interface Product {
  id: number;
  codigo: string;
  codigo_barras?: string | null;
  codigo_qr: string;
  nombre: string;
  categoria_id?: number | null;
  categoria_nombre?: string | null;
  descripcion?: string | null;
  unidad_medida: string;
  stock_actual: number;
  stock_minimo: number;
  ubicacion_almacen?: string | null;
  ubicacion_pasillo?: string | null;
  ubicacion_estante?: string | null;
  ubicacion_nivel?: string | null;
  proveedor?: string | null;
  imagen?: string | null;
  empresa_id?: number;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
  estado: ProductStatus;
}

export interface Movement {
  id: number;
  producto_id: number;
  tipo: MovementType;
  cantidad: number;
  stock_anterior: number;
  stock_nuevo: number;
  usuario_id: number;
  observacion?: string | null;
  destino?: string | null;
  motivo_ajuste?: string | null;
  guia_despacho?: string | null;
  responsable_recepcion?: string | null;
  fecha: string;
  hora: string;
  empresa_id?: number;
  fecha_creacion?: string;
  producto_nombre?: string;
  producto_codigo?: string;
  producto_imagen?: string | null;
  unidad_medida?: string;
  ubicacion_almacen?: string;
  ubicacion_pasillo?: string;
  ubicacion_estante?: string;
  ubicacion_nivel?: string;
  usuario_nombre?: string;
  usuario_username?: string;
}

export interface DashboardSummary {
  kpis: {
    total_productos: number;
    total_existencias: number;
    stock_bajo: number;
    agotados: number;
    disponibilidad_porcentaje?: number;
  };
  ultimos_movimientos: Movement[];
  ultimos_ingresos: Movement[];
  ultimos_despachos: Movement[];
  alertas_reposicion: Array<Product & { faltante: number }>;
}

export interface StorageConfig {
  id?: number;
  usuario_id?: number;
  empresa_id?: number | null;
  dispositivo_uuid: string;
  modo: StorageMode;
  tipo_almacenamiento_local: LocalStorageType;
  nombre_carpeta_local?: string | null;
  ruta_local_referencia?: string | null;
  auto_sincronizar: boolean;
  frecuencia_respaldo: BackupFrequency;
  cifrado_activo: boolean;
  estado_sincronizacion: SyncStatus;
  ultimo_respaldo?: string | null;
  proximo_respaldo?: string | null;
  ultimo_error?: string | null;
  bytes_utilizados_local?: number;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
}

export interface Respaldo {
  id: number;
  empresa_id: number;
  empresa_nombre?: string;
  usuario_id: number;
  usuario_nombre?: string;
  dispositivo_uuid?: string | null;
  tipo: 'MANUAL' | 'AUTOMATICO' | 'PREVENTIVO';
  nombre_archivo: string;
  ruta_archivo: string;
  tamano_bytes: number;
  checksum_sha256: string;
  total_productos: number;
  total_movimientos: number;
  total_categorias: number;
  estado: 'COMPLETADO' | 'ERROR' | 'RESTAURADO';
  detalles?: string | null;
  fecha_creacion: string;
}

export interface SincronizacionLog {
  id: number;
  empresa_id: number;
  empresa_nombre?: string;
  usuario_id?: number | null;
  usuario_nombre?: string | null;
  dispositivo_uuid?: string | null;
  tipo_operacion: 'SUBIDA' | 'DESCARGA' | 'CONFLICTO_RESUELTO' | 'RESTORE';
  entidad: string;
  registros_afectados: number;
  estado: 'EXITOSO' | 'FALLIDO' | 'EN_PROGRESO';
  detalles?: string | null;
  fecha_hora: string;
}

export interface StorageAdminStatus {
  empresas?: Array<{
    id: number;
    nombre: string;
    estado: string;
    total_respaldos: number;
    bytes_respaldos: number;
    ultimo_respaldo?: string | null;
    modo?: StorageMode | null;
    tipo_almacenamiento_local?: LocalStorageType | null;
    estado_sincronizacion?: SyncStatus | null;
    proximo_respaldo?: string | null;
  }>;
  global?: {
    total_respaldos_global: number;
    bytes_globales: number;
  };
  empresa?: {
    id: number;
    nombre: string;
    estado: string;
    total_respaldos: number;
    bytes_respaldos: number;
    ultimo_respaldo?: string | null;
    modo?: StorageMode | null;
    tipo_almacenamiento_local?: LocalStorageType | null;
    estado_sincronizacion?: SyncStatus | null;
    proximo_respaldo?: string | null;
  };
}
