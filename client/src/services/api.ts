import {
  Product,
  Movement,
  User,
  Category,
  DashboardSummary,
  Empresa,
  Plan,
  Pago,
  SaaSMetrics,
  AnalyticsCharts,
  WebhookLog,
  Suscripcion,
  Dispositivo,
  ActividadLog,
  ThemeType,
  AccentColor,
  StorageConfig,
  Respaldo,
  SincronizacionLog,
  StorageAdminStatus
} from '../types';
import { offlineDataRepository } from '../repositories/offlineDataRepository';
import { getDeviceUuid, isNetworkUnavailable, PendingMovementMutation } from './localStorageDb';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

interface SyncPushResult {
  sync_id: string;
  status: 'APPLIED' | 'CONFLICT';
  message: string;
  producto_id?: number | null;
  stock_actual?: number | null;
  proveedor?: string | null;
  duplicate?: boolean;
}

interface SyncPushResponse {
  success: boolean;
  appliedCount: number;
  conflictsCount: number;
  results: SyncPushResult[];
  timestamp: string;
}

type MovementInput =
  | {
      tipo: 'INGRESO';
      producto_id: number;
      cantidad: number;
      proveedor?: string;
      guia_despacho?: string;
      observacion?: string;
    }
  | {
      tipo: 'DESPACHO';
      producto_id: number;
      cantidad: number;
      destino?: string;
      guia_despacho?: string;
      responsable_recepcion?: string;
      observacion?: string;
    }
  | {
      tipo: 'AJUSTE';
      producto_id: number;
      stock_nuevo: number;
      motivo_ajuste: string;
      observacion?: string;
    };

let activeMovementSync: Promise<SyncPushResponse | null> | null = null;

async function submitMovement(input: MovementInput): Promise<{
  message: string;
  data: { producto_id: number; stock_nuevo?: number };
  stock_nuevo?: number;
  queued: boolean;
  sync_id: string;
}> {
  const user = await offlineDataRepository.getUser();
  if (!user || !user.empresa_id) {
    throw new ApiError('No se puede guardar el movimiento: no hay una sesión de empresa disponible en este dispositivo.', 0);
  }
  if (input.tipo === 'AJUSTE' && user.rol !== 'ADMINISTRADOR') {
    throw new ApiError('Solo un administrador puede realizar ajustes de inventario.', 403);
  }
  if (
    input.tipo !== 'AJUSTE' &&
    (!Number.isSafeInteger(input.cantidad) || input.cantidad <= 0)
  ) {
    throw new ApiError('La cantidad debe ser un entero positivo mayor a cero.', 400);
  }
  if (
    input.tipo === 'AJUSTE' &&
    (!Number.isSafeInteger(input.stock_nuevo) || input.stock_nuevo < 0 || !input.motivo_ajuste.trim())
  ) {
    throw new ApiError('El ajuste requiere un stock entero no negativo y un motivo.', 400);
  }

  const online = typeof navigator === 'undefined' || navigator.onLine;
  if (online) {
    try {
      await syncPendingMovementMutations();
    } catch (error) {
      if (!(error instanceof ApiError) || (error.status !== 0 && error.status < 500)) throw error;
    }
  }

  let stockBase = await offlineDataRepository.getEffectiveCachedStock(input.producto_id);
  if (online && stockBase === null) {
    const productResponse = await request<{ product: Product }>(`/products/${input.producto_id}`);
    stockBase = productResponse.product.stock_actual;
  }
  if (!online && stockBase === null) {
    throw new ApiError('No se puede registrar el movimiento offline porque el producto no tiene una copia local reciente.', 0);
  }
  if (!online && input.tipo === 'DESPACHO' && stockBase !== null && input.cantidad > stockBase) {
    throw new ApiError(`Stock insuficiente en la copia local. Disponible: ${stockBase}, solicitado: ${input.cantidad}.`, 0);
  }
  if (input.tipo === 'AJUSTE' && stockBase !== null && input.stock_nuevo === stockBase) {
    throw new ApiError('El nuevo stock es idéntico al stock local actual. No se requiere ajuste.', 0);
  }

  const occurredAt = new Date().toISOString();
  const mutation = await offlineDataRepository.enqueueMovement({
    user_id: user.id,
    empresa_id: user.empresa_id,
    dispositivo_uuid: getDeviceUuid(),
    data: {
      ...input,
      stock_base: stockBase,
      ocurrido_en: occurredAt,
      fecha: occurredAt.slice(0, 10),
      hora: new Date(occurredAt).toTimeString().split(' ')[0]
    }
  });

  if (!online) {
    const stockAfter = getStockAfterMutation(input, stockBase);
    notifyQueuedMovement();
    return {
      message: 'Movimiento guardado en este dispositivo. Se sincronizará cuando vuelva la conexión.',
      data: { producto_id: input.producto_id, stock_nuevo: stockAfter },
      stock_nuevo: stockAfter,
      queued: true,
      sync_id: mutation.sync_id
    };
  }

  let pushResult: SyncPushResponse;
  try {
    pushResult = (await syncPendingMovementMutations()) || {
      success: true,
      appliedCount: 0,
      conflictsCount: 0,
      results: [],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const isRetryable = error instanceof ApiError && (error.status === 0 || error.status >= 500);
    if (isRetryable) {
      const stockAfter = getStockAfterMutation(input, stockBase);
      notifyQueuedMovement();
      return {
        message: 'No se confirmó la conexión con el servidor. El movimiento quedó guardado localmente y pendiente de sincronización.',
        data: { producto_id: input.producto_id, stock_nuevo: stockAfter },
        stock_nuevo: stockAfter,
        queued: true,
        sync_id: mutation.sync_id
      };
    }
    throw error;
  }

  const result = pushResult.results?.find((item) => item.sync_id === mutation.sync_id);
  if (!result) {
    notifyQueuedMovement();
    const stockAfter = getStockAfterMutation(input, stockBase);
    return {
      message: 'El movimiento quedó guardado localmente y pendiente de confirmación del servidor.',
      data: { producto_id: input.producto_id, stock_nuevo: stockAfter },
      stock_nuevo: stockAfter,
      queued: true,
      sync_id: mutation.sync_id
    };
  }

  if (result.status === 'CONFLICT') {
    throw new ApiError(`Movimiento pendiente de resolución: ${result.message}`, 409, result);
  }
  return {
    message: result.message,
    data: { producto_id: input.producto_id, stock_nuevo: result.stock_actual ?? undefined },
    stock_nuevo: result.stock_actual ?? undefined,
    queued: false,
    sync_id: mutation.sync_id
  };
}

function notifyQueuedMovement(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('logixt:sync-notice', {
      detail: 'Movimiento guardado en este dispositivo; queda pendiente de sincronización.'
    }));
  }
}

function getStockAfterMutation(input: MovementInput, stockBase: number | null): number | undefined {
  if (stockBase === null) return input.tipo === 'AJUSTE' ? input.stock_nuevo : undefined;
  if (input.tipo === 'INGRESO') return stockBase + input.cantidad;
  if (input.tipo === 'DESPACHO') return stockBase - input.cantidad;
  return input.stock_nuevo;
}

export function syncPendingMovementMutations(retryErrors = false): Promise<SyncPushResponse | null> {
  if (activeMovementSync) return activeMovementSync;
  const active = runSyncPendingMovementMutations(retryErrors);
  activeMovementSync = active;
  void active.then(
    () => { if (activeMovementSync === active) activeMovementSync = null; },
    () => { if (activeMovementSync === active) activeMovementSync = null; }
  );
  return active;
}

async function runSyncPendingMovementMutations(retryErrors: boolean): Promise<SyncPushResponse | null> {
  const pending = await offlineDataRepository.getPendingMutations();
  for (const mutation of pending) {
    if (mutation.status === 'SYNCING') {
      await offlineDataRepository.updatePendingMutation(mutation.sync_id, {
        status: 'PENDING',
        last_error: 'Se recuperó una operación interrumpida; se reintentará con el mismo identificador idempotente.'
      });
    }
  }
  const recoveredPending = await offlineDataRepository.getPendingMutations();
  const mutations = recoveredPending
    .filter((item) => item.status === 'PENDING' || (retryErrors && item.status === 'ERROR'))
    .slice(0, 100);
  if (mutations.length === 0) return null;

  for (const mutation of mutations) {
    await offlineDataRepository.updatePendingMutation(mutation.sync_id, {
      status: 'SYNCING',
      attempts: mutation.attempts + 1,
      last_error: null
    });
  }

  let response: SyncPushResponse;
  try {
    response = await request<SyncPushResponse>('/storage/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        mutations,
        dispositivo_uuid: getDeviceUuid()
      })
    });
  } catch (error) {
    const retryable = error instanceof ApiError && (error.status === 0 || error.status >= 500);
    for (const mutation of mutations) {
      await offlineDataRepository.updatePendingMutation(mutation.sync_id, {
        status: retryable ? 'PENDING' : 'ERROR',
        last_error: error instanceof Error ? error.message : 'Error desconocido durante la sincronización.'
      });
    }
    throw error;
  }

  for (const mutation of mutations) {
    const result = response.results?.find((item) => item.sync_id === mutation.sync_id);
    if (!result) {
      await offlineDataRepository.settlePendingMutation(mutation.sync_id, 'ERROR', {
        message: 'El servidor no incluyó el resultado de esta operación.'
      });
      continue;
    }
    if (result.status === 'APPLIED') {
      await offlineDataRepository.settlePendingMutation(mutation.sync_id, 'APPLIED', {
        productId: result.producto_id,
        stock: result.stock_actual,
        proveedor: result.proveedor
      });
    } else {
      await offlineDataRepository.settlePendingMutation(mutation.sync_id, 'CONFLICT', {
        message: result.message,
        productId: result.producto_id,
        stock: result.stock_actual,
        proveedor: result.proveedor
      });
    }
  }
  return response;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('wms_token');
  const method = (options.method || 'GET').toUpperCase();
  const cacheableGet = method === 'GET' && !endpoint.startsWith('/storage/google-drive/');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-device-uuid': getDeviceUuid(),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (error) {
    if (!isNetworkUnavailable(error)) throw error;

    if (method === 'GET' && !token) {
      throw new ApiError('No hay conexión y no existe una sesión autenticada previamente en este dispositivo.', 0);
    }

    if (method === 'GET') {
      if (cacheableGet) {
        const cachedResponse = await offlineDataRepository.getResponse<T>(endpoint);
        if (cachedResponse !== null) return await applyPendingStockOverlay(cachedResponse);
      }
      throw new ApiError('No hay conexión y esta consulta todavía no tiene una copia local.', 0);
    }

    throw new ApiError('Sin conexión: el modo offline actual permite consultar datos guardados, pero no realizar cambios.', 0);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || data.message || `Error ${response.status}: ${response.statusText}`;
    throw new ApiError(errorMsg, response.status, data);
  }

  if (cacheableGet && token) {
    try {
      await offlineDataRepository.saveResponse(endpoint, data);
    } catch (error) {
      console.warn('No se pudo guardar la consulta para uso offline:', error);
    }
  }

  return data as T;
}

async function downloadStorageBackup(id: number): Promise<{ fileName: string }> {
  const token = localStorage.getItem('wms_token');
  if (!token) throw new ApiError('Inicia sesión para descargar el respaldo.', 401);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/storage/backup/${id}/download`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-device-uuid': getDeviceUuid()
      }
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor para descargar el respaldo.', 0);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      data.error || `No se pudo descargar el respaldo (HTTP ${response.status}).`,
      response.status,
      data
    );
  }

  const contentDisposition = response.headers.get('Content-Disposition') || '';
  const encodedName = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plainName = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];
  let fileName = `logixt-respaldo-${id}.json`;
  try {
    if (encodedName) fileName = decodeURIComponent(encodedName);
    else if (plainName) fileName = plainName;
  } catch {
    fileName = `logixt-respaldo-${id}.json`;
  }
  fileName = fileName.replace(/[\\/:*?"<>|]/g, '_');

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return { fileName };
}

async function applyPendingStockOverlay<T>(response: T): Promise<T> {
  const pending = await offlineDataRepository.getPendingMutations();
  const productIds = [...new Set(pending
    .filter((mutation) => mutation.status === 'PENDING' || mutation.status === 'SYNCING')
    .map((mutation) => mutation.data.producto_id))];
  if (productIds.length === 0) return response;

  const copy = JSON.parse(JSON.stringify(response)) as unknown;
  for (const productId of productIds) {
    const stock = await offlineDataRepository.getEffectiveCachedStock(productId);
    if (stock === null) continue;
    updateProductStockInResponse(copy, productId, stock);
  }
  return copy as T;
}

function updateProductStockInResponse(value: unknown, productId: number, stock: number): void {
  if (Array.isArray(value)) {
    value.forEach((item) => updateProductStockInResponse(item, productId, stock));
    return;
  }
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  if (record.id === productId && typeof record.stock_actual === 'number') {
    record.stock_actual = stock;
  }
  Object.values(record).forEach((item) => updateProductStockInResponse(item, productId, stock));
}

export const api = {
  // Autenticación y Perfil
  auth: {
    login: (usuario: string, contrasena: string) =>
      request<{ token: string; user: User; message: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ usuario, contrasena }),
      }),
    me: () => request<{ user: User }>('/auth/me'),
    updateProfile: (data: { nombre: string; apellido?: string; email?: string; telefono?: string; foto?: string }) =>
      request<{ message: string; user: User }>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    updatePreferences: (data: { tema?: ThemeType; color_acento?: AccentColor }) =>
      request<{ message: string; tema: ThemeType; color_acento: AccentColor }>('/auth/preferences', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    changePassword: (contrasena_actual: string, contrasena_nueva: string) =>
      request<{ message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ contrasena_actual, contrasena_nueva }),
      }),
  },

  // Dashboard y Métricas de Almacén
  dashboard: {
    getSummary: () => request<DashboardSummary>('/dashboard/summary'),
  },

  // Productos
  products: {
    getAll: (params?: { search?: string; categoria_id?: number | string; estado?: string; sort_by?: string }) => {
      const query = new URLSearchParams();
      if (params?.search) query.append('search', params.search);
      if (params?.categoria_id) query.append('categoria_id', String(params.categoria_id));
      if (params?.estado) query.append('estado', params.estado);
      if (params?.sort_by) query.append('sort_by', params.sort_by);
      return request<{ products: Product[]; total: number }>(`/products?${query.toString()}`);
    },
    getById: (id: number) => request<{ product: Product; movements: Movement[] }>(`/products/${id}`),
    lookup: (code: string) => request<{ product: Product }>(`/products/lookup/${encodeURIComponent(code)}`),
    create: (data: Partial<Product> & { stock_inicial?: number }) =>
      request<{ message: string; product: Product }>('/products', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<Product>) =>
      request<{ message: string; product: Product }>(`/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      request<{ message: string }>(`/products/${id}`, {
        method: 'DELETE',
      }),
  },

  // Movimientos
  movements: {
    getAll: (params?: {
      producto_id?: number;
      tipo?: string;
      search?: string;
      fecha_desde?: string;
      fecha_hasta?: string;
      limit?: number;
      page?: number;
    }) => {
      const query = new URLSearchParams();
      if (params?.producto_id) query.append('producto_id', String(params.producto_id));
      if (params?.tipo) query.append('tipo', params.tipo);
      if (params?.search) query.append('search', params.search);
      if (params?.fecha_desde) query.append('fecha_desde', params.fecha_desde);
      if (params?.fecha_hasta) query.append('fecha_hasta', params.fecha_hasta);
      if (params?.limit) query.append('limit', String(params.limit));
      if (params?.page) query.append('page', String(params.page));
      return request<{ movements: Movement[]; total: number }>(`/movements?${query.toString()}`);
    },
    getHistory: (params?: {
      producto_id?: number;
      tipo?: string;
      fecha_inicio?: string;
      fecha_fin?: string;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params?.producto_id) query.append('producto_id', String(params.producto_id));
      if (params?.tipo) query.append('tipo', params.tipo);
      if (params?.fecha_inicio) query.append('fecha_desde', params.fecha_inicio);
      if (params?.fecha_fin) query.append('fecha_hasta', params.fecha_fin);
      if (params?.limit) query.append('limit', String(params.limit));
      return request<{ movements: Movement[]; total: number }>(`/movements?${query.toString()}`);
    },
    inbound: (data: {
      producto_id: number;
      cantidad: number;
      proveedor?: string;
      guia_despacho?: string;
      observacion?: string;
    }) => submitMovement({ ...data, tipo: 'INGRESO' }),
    outbound: (data: {
      producto_id: number;
      cantidad: number;
      destino?: string;
      guia_despacho?: string;
      responsable_recepcion?: string;
      observacion?: string;
    }) => submitMovement({ ...data, tipo: 'DESPACHO' }),
    adjust: (data: {
      producto_id: number;
      stock_nuevo: number;
      motivo_ajuste: string;
      observacion?: string;
    }) => submitMovement({ ...data, tipo: 'AJUSTE' }),
    create: (data: {
      producto_id: number;
      tipo: 'INGRESO' | 'DESPACHO' | 'AJUSTE';
      cantidad: number;
      destino?: string;
      motivo_ajuste?: string;
      observacion?: string;
      guia_despacho?: string;
      responsable_recepcion?: string;
    }) =>
      request<{ message: string; movimiento: Movement; stock_nuevo: number }>('/movements', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // Categorías
  categories: {
    getAll: () => request<{ categories: Category[] }>('/categories'),
    create: (data: Partial<Category>) =>
      request<{ message: string; category: Category }>('/categories', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<Category>) =>
      request<{ message: string; category: Category }>(`/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      request<{ message: string }>(`/categories/${id}`, {
        method: 'DELETE',
      }),
  },

  // Usuarios (Admin de Almacén)
  users: {
    getAll: () => request<{ users: User[] }>('/users'),
    create: (data: { nombre: string; usuario: string; contrasena: string; rol: string }) =>
      request<{ message: string; user: User }>('/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    toggleStatus: (id: number) =>
      request<{ message: string; user: User }>(`/users/${id}/toggle-status`, {
        method: 'PATCH',
      }),
    resetPassword: (id: number, contrasena: string) =>
      request<{ message: string }>(`/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ contrasena, nueva_contrasena: contrasena }),
      }),
    updateStatus: (id: number, estado: 'ACTIVO' | 'INACTIVO') =>
      request<{ message: string; user: User }>(`/users/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ estado }),
      }),
    delete: (id: number) =>
      request<{ message: string }>(`/users/${id}`, {
        method: 'DELETE',
      }),
  },

  // 📱 Dispositivos del Cliente (Tenant)
  devices: {
    getMyDevices: () =>
      request<{
        dispositivos: Dispositivo[];
        max_dispositivos: number;
        activos_count: number;
        limite_alcanzado: boolean;
        plan_nombre: string;
      }>('/devices'),
    activateWithCode: (data: {
      codigo: string;
      nombre?: string;
      tipo?: string;
      sistema_operativo?: string;
      version_logixt?: string;
    }) =>
      request<{ message: string; dispositivo: Dispositivo }>('/devices/activate', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    ping: (id: number) =>
      request<{ status: string; timestamp: string }>(`/devices/${id}/ping`, {
        method: 'POST',
      }),
  },

  // 👑 Administración de Plataforma SaaS (SuperAdmin)
  admin: {
    getMetrics: () => request<{ metrics: SaaSMetrics; charts: AnalyticsCharts }>('/admin/metrics'),
    getAllEmpresas: (params?: { search?: string; estado?: string; plan_id?: string | number }) => {
      const query = new URLSearchParams();
      if (params?.search) query.append('search', params.search);
      if (params?.estado) query.append('estado', params.estado);
      if (params?.plan_id) query.append('plan_id', String(params.plan_id));
      return request<{ empresas: Empresa[] }>(`/admin/empresas?${query.toString()}`);
    },
    createEmpresa: (data: {
      nombre: string;
      email: string;
      telefono?: string;
      plan_id: number;
      admin_nombre: string;
      admin_usuario: string;
      admin_contrasena: string;
    }) =>
      request<{ message: string; empresa: Empresa }>('/admin/empresas', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateEmpresa: (id: number, data: Partial<Empresa>) =>
      request<{ message: string; empresa: Empresa }>(`/admin/empresas/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    toggleEmpresaStatus: (id: number) =>
      request<{ message: string; nuevoEstado: string }>(`/admin/empresas/${id}/toggle-status`, {
        method: 'PATCH',
      }),
    deleteEmpresa: (id: number) =>
      request<{ ok: boolean; message: string }>(`/admin/empresas/${id}`, {
        method: 'DELETE',
      }),
    deleteUser: (id: number) =>
      request<{ ok: boolean; message: string }>(`/admin/users/${id}`, {
        method: 'DELETE',
      }),
    changePlan: (id: number, plan_id: number) =>
      request<{ message: string; plan: Plan }>(`/admin/empresas/${id}/change-plan`, {
        method: 'PATCH',
        body: JSON.stringify({ plan_id }),
      }),
    extendSubscription: (id: number, data: { dias_adicionales?: number; nueva_fecha?: string }) =>
      request<{ message: string; nueva_fecha: string }>(`/admin/empresas/${id}/extend-subscription`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getEmpresaUsers: (id: number) => request<{ users: User[] }>(`/admin/empresas/${id}/users`),
    getEmpresaPayments: (id: number) => request<{ payments: Pago[] }>(`/admin/empresas/${id}/payments`),
    getEmpresaDevices: (id: number) => request<{ dispositivos: Dispositivo[] }>(`/admin/empresas/${id}/devices`),
    getEmpresaActivity: (id: number) => request<{ activity: ActividadLog[] }>(`/admin/empresas/${id}/activity`),

    // Dispositivos SuperAdmin
    devices: {
      getAll: (params?: { search?: string; empresa_id?: number | string; estado?: string; tipo?: string }) => {
        const query = new URLSearchParams();
        if (params?.search) query.append('search', params.search);
        if (params?.empresa_id) query.append('empresa_id', String(params.empresa_id));
        if (params?.estado) query.append('estado', params.estado);
        if (params?.tipo) query.append('tipo', params.tipo);
        return request<{
          dispositivos: Dispositivo[];
          stats: {
            total: number;
            activos: number;
            pendientes: number;
            bloqueados: number;
            tablets: number;
            pcs: number;
          };
        }>(`/admin/devices?${query.toString()}`);
      },
      create: (data: {
        empresa_id: number;
        nombre: string;
        tipo?: string;
        sistema_operativo?: string;
        version_logixt?: string;
      }) =>
        request<{
          message: string;
          dispositivo: Dispositivo;
          codigo_activacion: string;
          expira: string;
        }>('/admin/devices', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      generateCode: (id: number) =>
        request<{ message: string; codigo_activacion: string; expira: string }>(
          `/admin/devices/${id}/generate-code`,
          { method: 'POST' }
        ),
      toggleStatus: (id: number, estado: string) =>
        request<{ message: string; nuevoEstado: string }>(`/admin/devices/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ estado }),
        }),
      delete: (id: number) =>
        request<{ message: string }>(`/admin/devices/${id}`, {
          method: 'DELETE',
        }),
    },

    // Módulos Globales
    getAllSubscriptions: () => request<{ suscripciones: Suscripcion[] }>('/admin/subscriptions'),
    getAllPayments: () => request<{ payments: Pago[] }>('/admin/payments'),
    getAllUsers: () => request<{ usuarios: User[] }>('/admin/users'),
    getActivityLogs: (params?: { empresa_id?: number | string; accion?: string; search?: string }) => {
      const query = new URLSearchParams();
      if (params?.empresa_id) query.append('empresa_id', String(params.empresa_id));
      if (params?.accion) query.append('accion', params.accion);
      if (params?.search) query.append('search', params.search);
      return request<{ logs: ActividadLog[] }>(`/admin/activity?${query.toString()}`);
    },

    // Planes
    getAllPlanes: () => request<{ planes: Plan[] }>('/admin/planes'),
    updatePlan: (id: number, data: Partial<Plan>) =>
      request<{ message: string; plan: Plan }>(`/admin/planes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    // Configuración
    getConfig: () => request<{ config: Record<string, string> }>('/admin/config'),
    updateConfig: (data: { dias_periodo_gracia?: number }) =>
      request<{ message: string }>('/admin/config', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    getWebhookLogs: () => request<{ logs: WebhookLog[] }>('/admin/webhook-logs'),
  },

  // 💳 Suscripciones del Cliente (Tenant)
  subscriptions: {
    getMySubscription: () =>
      request<{
        subscription: Empresa & {
          suscripcion_id: number;
          suscripcion_estado: string;
          dias_gracia: number;
          dias_vencido: number;
          dias_gracia_restantes: number;
          en_periodo_gracia: boolean;
          max_dispositivos?: number;
          caracteristicas: string[];
          uso: {
            usuarios_activos: number;
            max_usuarios: number;
            total_productos: number;
            max_almacenes: number;
          };
        };
        payments: Pago[];
      }>('/subscriptions/my-subscription'),
    simulatePayment: (empresa_id?: number) =>
      request<{ message: string; payment_id: string; nueva_fecha: string; estado: string }>(
        '/subscriptions/simulate-payment',
        {
          method: 'POST',
          body: JSON.stringify({ empresa_id }),
        }
      ),
  },

  // ⚡ Webhooks y Simulador
  webhooks: {
    simulate: (data: { type: string; empresa_id: number; amount?: number }) =>
      request<{ status: string; message: string }>('/webhooks/simulate', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // 💾 Almacenamiento Local y Sincronización en la Nube
  storage: {
    getGoogleDriveStatus: () =>
      request<{
        configured: boolean;
        missingConfiguration: string[];
        connected: boolean;
        connectedAt: string | null;
        uploadedBackupCount: number;
        lastUploadAt: string | null;
      }>('/storage/google-drive/status'),

    getGoogleDriveBackups: (pageToken?: string) =>
      request<{
        backups: Array<{
          id: string;
          name: string;
          sizeBytes: number;
          createdAt: string | null;
          checksumSha256: string;
          sourceBackupId: string | null;
        }>;
        nextPageToken: string | null;
      }>(`/storage/google-drive/backups${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ''}`),

    connectGoogleDrive: () =>
      request<{ authorizationUrl: string }>('/storage/google-drive/connect', {
        method: 'POST',
        body: JSON.stringify({}),
      }),

    disconnectGoogleDrive: () =>
      request<{ message: string }>('/storage/google-drive/disconnect', {
        method: 'POST',
        body: JSON.stringify({}),
      }),

    uploadBackupToGoogleDrive: (id: number) =>
      request<{
        message: string;
        alreadyUploaded: boolean;
        file: { id: string; name: string; webViewLink: string | null };
      }>(`/storage/backup/${id}/google-drive`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),

    restoreGoogleDriveBackup: (fileId: string) =>
      request<{
        message: string;
        preventiveBackupId: number;
        restoredCounts: { productos: number; movimientos: number; categorias: number };
      }>(`/storage/google-drive/backups/${encodeURIComponent(fileId)}/restore`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),

    getConfig: () =>
      request<{
        configurado: boolean;
        config: StorageConfig;
        resumen_empresa: {
          total_respaldos: number;
          total_bytes_respaldos: number;
          ultimo_respaldo_global: string | null;
          inventario: { productos: number; movimientos: number; categorias: number };
        };
      }>('/storage/config'),

    saveConfig: (data: Partial<StorageConfig>) =>
      request<{
        message: string;
        modo: string;
        tipo_almacenamiento_local: string;
        initialBackup?: Respaldo;
      }>('/storage/config', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    createBackup: (data?: { tipo?: 'MANUAL' | 'AUTOMATICO' | 'PREVENTIVO'; detalles?: string; empresa_id?: number }) =>
      request<{ message: string; backup: Respaldo }>('/storage/backup/create', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),

    getBackups: () => request<{ respaldos: Respaldo[] }>('/storage/backups'),

    downloadBackup: (id: number) => downloadStorageBackup(id),

    restoreBackup: (id: number) =>
      request<{ message: string; preventiveBackupId: number; restoredCounts: any }>(
        `/storage/backup/${id}/restore`,
        { method: 'POST' }
      ),

    deleteBackup: (id: number) =>
      request<{ message: string }>(`/storage/backup/${id}`, {
        method: 'DELETE',
      }),

    syncPull: (since?: string | null) =>
      (async () => {
        const cursor = since === null
          ? undefined
          : since ?? await offlineDataRepository.getLastSyncTimestamp() ?? undefined;
        const snapshot = await request<{
          timestamp: string;
          categorias: Category[];
          productos: Product[];
          movimientos: Movement[];
        }>('/storage/sync/pull', {
          method: 'POST',
          body: JSON.stringify({ since: cursor }),
        });
        await offlineDataRepository.mergeInventorySnapshot(snapshot);
        await offlineDataRepository.setLastSyncTimestamp(snapshot.timestamp);
        return snapshot;
      })(),

    syncPush: (mutations: PendingMovementMutation[]) =>
      request<SyncPushResponse>('/storage/sync/push', {
        method: 'POST',
        body: JSON.stringify({ mutations, dispositivo_uuid: getDeviceUuid() }),
      }),

    getLogs: () => request<{ logs: SincronizacionLog[] }>('/storage/logs'),

    getAdminStatus: () => request<StorageAdminStatus>('/storage/admin/status'),
  },
};
