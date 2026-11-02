import { Product, Category, Movement, User } from '../types';

const DB_NAME = 'LogixtLocalDB';
const DB_VERSION = 3;
const OFFLINE_USER_KEY = 'logixt_offline_user_id';

// Referencia en memoria al manejador del directorio local del sistema (HTML5 File System Access API)
let activeDirectoryHandle: any = null;
let activeStorageUser: Pick<User, 'id' | 'empresa_id' | 'rol'> | null = null;

interface CachedApiResponse {
  cache_key: string;
  user_id: number;
  empresa_id: number | null;
  endpoint: string;
  cached_at: string;
  data: unknown;
}

export interface PendingMovementMutation {
  sync_id: string;
  entity: 'movimiento';
  action: 'CREATE';
  user_id: number;
  empresa_id: number;
  dispositivo_uuid: string;
  data: {
    producto_id: number;
    tipo: 'INGRESO' | 'DESPACHO' | 'AJUSTE';
    cantidad?: number;
    stock_nuevo?: number;
    stock_base: number | null;
    destino?: string;
    motivo_ajuste?: string;
    observacion?: string;
    proveedor?: string;
    guia_despacho?: string;
    responsable_recepcion?: string;
    fecha: string;
    hora: string;
    ocurrido_en: string;
  };
  created_at: string;
  sequence: number;
  status: 'PENDING' | 'SYNCING' | 'CONFLICT' | 'ERROR';
  attempts: number;
  last_error?: string | null;
}

function getApiCacheKey(endpoint: string): string | null {
  if (!activeStorageUser) return null;
  return `${activeStorageUser.id}:${activeStorageUser.empresa_id ?? 'platform'}:${activeStorageUser.rol}:${endpoint}`;
}

function getLocalUserId(): number | null {
  if (typeof localStorage === 'undefined') return null;
  const id = Number(localStorage.getItem(OFFLINE_USER_KEY));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function isNetworkUnavailable(error: unknown): boolean {
  return (typeof navigator !== 'undefined' && !navigator.onLine) || error instanceof TypeError;
}

export function setActiveStorageUser(user: User | null): void {
  activeStorageUser = user
    ? { id: user.id, empresa_id: user.empresa_id, rol: user.rol }
    : null;
}

export async function saveOfflineUser(user: User): Promise<void> {
  setActiveStorageUser(user);
  localStorage.setItem(OFFLINE_USER_KEY, String(user.id));

  const db = await openIndexedDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('offline_users', 'readwrite');
    tx.objectStore('offline_users').put(user);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo guardar la sesión local.'));
  });
}

export async function getOfflineUser(): Promise<User | null> {
  const userId = getLocalUserId();
  if (!userId) return null;

  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_users', 'readonly');
    const request = tx.objectStore('offline_users').get(userId);
    request.onsuccess = () => resolve((request.result as User | undefined) || null);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheApiResponse(endpoint: string, data: unknown): Promise<void> {
  if (!activeStorageUser) return;

  const cacheKey = getApiCacheKey(endpoint);
  if (!cacheKey) return;

  const db = await openIndexedDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('api_cache', 'readwrite');
    const cache: CachedApiResponse = {
      cache_key: cacheKey,
      user_id: activeStorageUser!.id,
      empresa_id: activeStorageUser!.empresa_id ?? null,
      endpoint,
      cached_at: new Date().toISOString(),
      data
    };
    tx.objectStore('api_cache').put(cache);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo guardar la consulta local.'));
  });
}

export async function getCachedApiResponse<T>(endpoint: string): Promise<T | null> {
  const cacheKey = getApiCacheKey(endpoint);
  if (!cacheKey) return null;

  const db = await openIndexedDb();
  const cached = await new Promise<unknown | null>((resolve, reject) => {
    const tx = db.transaction('api_cache', 'readonly');
    const request = tx.objectStore('api_cache').get(cacheKey);
    request.onsuccess = () => {
      const cached = request.result as CachedApiResponse | undefined;
      resolve(cached ? cached.data : null);
    };
    request.onerror = () => reject(request.error);
  });
  if (cached !== null) return cached as T;

  return await getLocalInventoryResponse<T>(endpoint);
}

async function getLocalInventoryResponse<T>(endpoint: string): Promise<T | null> {
  const user = activeStorageUser;
  if (!user?.empresa_id) return null;

  const path = endpoint.split('?')[0];
  if (
    path !== '/categories' &&
    path !== '/products' &&
    !/^\/products\/\d+$/.test(path) &&
    !path.startsWith('/products/lookup/') &&
    path !== '/movements' &&
    path !== '/dashboard/summary'
  ) {
    return null;
  }

  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'categories', 'movements'], 'readonly');
    const productsRequest = tx.objectStore('products').getAll();
    const categoriesRequest = tx.objectStore('categories').getAll();
    const movementsRequest = tx.objectStore('movements').getAll();

    tx.oncomplete = () => {
      const products = (productsRequest.result as Product[])
        .filter((product) => product.empresa_id === user.empresa_id);
      const categories = (categoriesRequest.result as Category[])
        .filter((category) => category.empresa_id === user.empresa_id);
      const movements = (movementsRequest.result as Movement[])
        .filter((movement) => movement.empresa_id === user.empresa_id);
      const query = new URLSearchParams(endpoint.split('?')[1] || '');

      if (path === '/dashboard/summary') {
        const orderedMovements = [...movements].sort((left, right) =>
          `${right.fecha}T${right.hora}`.localeCompare(`${left.fecha}T${left.hora}`) ||
          right.id - left.id
        );
        const inbound = orderedMovements.filter((movement) => movement.tipo === 'INGRESO');
        const dispatches = orderedMovements.filter((movement) => movement.tipo === 'DESPACHO');
        const lowStock = products.filter((product) =>
          product.stock_actual > 0 && product.stock_actual <= product.stock_minimo
        ).length;
        const outOfStock = products.filter((product) => product.stock_actual === 0).length;
        resolve({
          kpis: {
            total_productos: products.length,
            total_existencias: products.reduce((sum, product) => sum + product.stock_actual, 0),
            stock_bajo: lowStock,
            agotados: outOfStock,
            disponibilidad_porcentaje: products.length > 0
              ? Number((((products.length - outOfStock) / products.length) * 100).toFixed(1))
              : 100
          },
          ultimos_movimientos: orderedMovements.slice(0, 10),
          ultimos_ingresos: inbound.slice(0, 6),
          ultimos_despachos: dispatches.slice(0, 6),
          alertas_reposicion: products
            .filter((product) => product.stock_actual <= product.stock_minimo)
            .sort((left, right) =>
              left.stock_actual - right.stock_actual ||
              (right.stock_minimo - right.stock_actual) - (left.stock_minimo - left.stock_actual)
            )
            .slice(0, 10)
            .map((product) => ({
              ...product,
              faltante: product.stock_minimo - product.stock_actual
            }))
        } as T);
        return;
      }

      if (path === '/categories') {
        resolve({ categories } as T);
        return;
      }

      if (path === '/products') {
        const search = query.get('search')?.trim().toLocaleLowerCase();
        const categoryId = Number(query.get('categoria_id'));
        const status = query.get('estado')?.toLocaleLowerCase();
        const filtered = products.filter((product) => {
          const matchesSearch = !search || [
            product.codigo,
            product.codigo_barras,
            product.codigo_qr,
            product.nombre,
            product.descripcion,
            product.ubicacion_pasillo,
            product.ubicacion_estante,
            product.categoria_nombre
          ].filter(Boolean).join(' ').toLocaleLowerCase().includes(search);
          const matchesCategory = !query.has('categoria_id') || product.categoria_id === categoryId;
          const knownStatus = status === 'agotado' || status === 'bajo' ||
            status === 'stock bajo' || status === 'disponible';
          const matchesStatus = !status || !knownStatus ||
            (status === 'agotado' && product.stock_actual === 0) ||
            ((status === 'bajo' || status === 'stock bajo') &&
              product.stock_actual > 0 && product.stock_actual <= product.stock_minimo) ||
            (status === 'disponible' && product.stock_actual > product.stock_minimo);
          return matchesSearch && matchesCategory && matchesStatus;
        });
        const sortBy = query.get('sort_by');
        filtered.sort((left, right) => {
          if (sortBy === 'stock_asc') return left.stock_actual - right.stock_actual;
          if (sortBy === 'stock_desc') return right.stock_actual - left.stock_actual;
          if (sortBy === 'nombre') return left.nombre.localeCompare(right.nombre);
          return (right.fecha_actualizacion || '').localeCompare(left.fecha_actualizacion || '');
        });
        resolve({ products: filtered, total: filtered.length } as T);
        return;
      }

      if (path.startsWith('/products/lookup/')) {
        const code = decodeURIComponent(path.slice('/products/lookup/'.length)).toLocaleLowerCase();
        const product = products.find((candidate) =>
          candidate.codigo.toLocaleLowerCase() === code ||
          candidate.codigo_barras === code ||
          candidate.codigo_qr === code
        );
        resolve(product ? { product } as T : null);
        return;
      }

      if (path.startsWith('/products/')) {
        const productId = Number(path.slice('/products/'.length));
        const product = products.find((candidate) => candidate.id === productId);
        if (!product) {
          resolve(null);
          return;
        }
        const productMovements = movements
          .filter((movement) => movement.producto_id === productId)
          .sort((left, right) =>
            `${right.fecha}T${right.hora}`.localeCompare(`${left.fecha}T${left.hora}`) ||
            right.id - left.id
          )
          .slice(0, 10);
        resolve({ product, movements: productMovements } as T);
        return;
      }

      const filtered = movements
        .filter((movement) => movementMatchesEndpoint(movement, endpoint))
        .sort((left, right) =>
          `${right.fecha}T${right.hora}`.localeCompare(`${left.fecha}T${left.hora}`) ||
          right.id - left.id
        );
      const requestedLimit = Number(query.get('limit'));
      const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : 200;
      const limited = filtered.slice(0, limit);
      resolve({ movements: limited, total: limited.length } as T);
    };

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudieron leer los datos locales de inventario.'));
  });
}

export async function clearOfflineUser(userId: number): Promise<void> {
  const db = await openIndexedDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['offline_users', 'api_cache', 'metadata'], 'readwrite');
    tx.objectStore('offline_users').delete(userId);

    const cacheStore = tx.objectStore('api_cache');
    const request = cacheStore.index('user_id').openCursor(IDBKeyRange.only(userId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    const metadataCursor = tx.objectStore('metadata').openCursor();
    metadataCursor.onsuccess = () => {
      const cursor = metadataCursor.result;
      if (cursor) {
        if (String(cursor.key).startsWith(`last_inventory_sync:${userId}:`)) cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo limpiar el almacenamiento offline.'));
  });

  if (getLocalUserId() === userId) {
    localStorage.removeItem(OFFLINE_USER_KEY);
  }
  if (activeStorageUser?.id === userId) {
    activeStorageUser = null;
  }
}

/**
 * Obtiene o inicializa un UUID único y persistente para este dispositivo/navegador
 */
export function getDeviceUuid(): string {
  let uuid = localStorage.getItem('logixt_device_uuid');
  if (!uuid) {
    uuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('logixt_device_uuid', uuid);
  }
  return uuid;
}

/**
 * Obtiene el nombre guardado de la carpeta local configurada
 */
export function getSavedLocalFolderName(): string | null {
  return localStorage.getItem('logixt_local_folder_name');
}

/**
 * Guarda el nombre de la carpeta local en preferencias
 */
export function setSavedLocalFolderName(name: string | null): void {
  if (name) {
    localStorage.setItem('logixt_local_folder_name', name);
  } else {
    localStorage.removeItem('logixt_local_folder_name');
  }
}

/**
 * Consulta la cuota de almacenamiento real del navegador (Web Storage API)
 */
export async function getStorageQuota(): Promise<{
  usageBytes: number;
  quotaBytes: number;
  usagePercent: number;
  isPersistent: boolean;
}> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const isPersistent = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      const usage = estimate.usage || 0;
      const quota = estimate.quota || (1024 * 1024 * 1024); // 1 GB fallback
      const percent = Math.min(100, Math.round((usage / quota) * 100));

      return {
        usageBytes: usage,
        quotaBytes: quota,
        usagePercent: percent,
        isPersistent
      };
    }
  } catch (err) {
    console.warn('No se pudo estimar la cuota de almacenamiento:', err);
  }

  return {
    usageBytes: 0,
    quotaBytes: 1024 * 1024 * 500, // 500 MB
    usagePercent: 0,
    isPersistent: false
  };
}

/**
 * Solicita al navegador almacenamiento persistente para evitar desalojos por falta de espacio
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch (err) {
    console.warn('Error al solicitar almacenamiento persistente:', err);
  }
  return false;
}

/**
 * Solicita acceso a un directorio del sistema de archivos local mediante File System Access API
 * Si el navegador no lo soporta (ej. Safari, Firefox) o el usuario declina, devuelve estado claro.
 */
export async function requestLocalDirectory(): Promise<{
  supported: boolean;
  granted: boolean;
  folderName?: string;
  error?: string;
}> {
  // Comprobar si el navegador soporta File System Access API
  if (typeof window === 'undefined' || !(window as any).showDirectoryPicker) {
    return {
      supported: false,
      granted: false,
      error: 'Tu navegador actual no soporta selección directa de carpetas del sistema operativo (File System Access API). Se utilizará almacenamiento privado persistente (IndexedDB/OPFS) totalmente compatible y seguro.'
    };
  }

  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents'
    });

    if (!handle) {
      return { supported: true, granted: false, error: 'No se seleccionó ninguna carpeta.' };
    }

    // Verificar permisos de escritura en la carpeta
    const testFile = await handle.getFileHandle('.logixt_check.tmp', { create: true });
    const writable = await testFile.createWritable();
    await writable.write('Logixt Storage Verified');
    await writable.close();
    await handle.removeEntry('.logixt_check.tmp');

    activeDirectoryHandle = handle;
    const folderName = handle.name || 'Carpeta Local Seleccionada';
    setSavedLocalFolderName(folderName);

    return {
      supported: true,
      granted: true,
      folderName
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { supported: true, granted: false, error: 'Selección de carpeta cancelada por el usuario.' };
    }
    return {
      supported: true,
      granted: false,
      error: err.message || 'Error al solicitar permisos sobre el directorio local.'
    };
  }
}

/**
 * Inicializa la base de datos local IndexedDB (LogixtLocalDB)
 */
function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB no está disponible en este entorno.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;

      if (!db.objectStoreNames.contains('products')) {
        const prodStore = db.createObjectStore('products', { keyPath: 'id' });
        prodStore.createIndex('empresa_id', 'empresa_id', { unique: false });
        prodStore.createIndex('codigo', 'codigo', { unique: false });
      }

      if (!db.objectStoreNames.contains('categories')) {
        const catStore = db.createObjectStore('categories', { keyPath: 'id' });
        catStore.createIndex('empresa_id', 'empresa_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('movements')) {
        const movStore = db.createObjectStore('movements', { keyPath: 'id' });
        movStore.createIndex('empresa_id', 'empresa_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('pending_queue')) {
        const queueStore = db.createObjectStore('pending_queue', { keyPath: 'sync_id' });
        queueStore.createIndex('created_at', 'created_at', { unique: false });
      }
      const queueStore = (event.target as IDBOpenDBRequest).transaction?.objectStore('pending_queue');
      if (queueStore && !queueStore.indexNames.contains('user_id')) {
        queueStore.createIndex('user_id', 'user_id', { unique: false });
      }
      if (queueStore && !queueStore.indexNames.contains('status')) {
        queueStore.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('offline_users')) {
        db.createObjectStore('offline_users', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('api_cache')) {
        const cacheStore = db.createObjectStore('api_cache', { keyPath: 'cache_key' });
        cacheStore.createIndex('user_id', 'user_id', { unique: false });
        cacheStore.createIndex('cached_at', 'cached_at', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Guarda productos en el almacenamiento local IndexedDB
 */
export async function saveProductsLocally(products: Product[]): Promise<void> {
  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');

    for (const prod of products) {
      store.put(prod);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Obtiene los productos almacenados localmente
 */
export async function getProductsLocally(empresaId?: number): Promise<Product[]> {
  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const request = store.getAll();

    request.onsuccess = () => {
      let results: Product[] = request.result || [];
      if (empresaId) {
        results = results.filter((p) => p.empresa_id === empresaId);
      }
      resolve(results);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Encola una mutación en la cola de sincronización offline
 */
export async function queueOfflineMutation(mutation: {
  user_id: number;
  empresa_id: number;
  dispositivo_uuid: string;
  data: PendingMovementMutation['data'];
}): Promise<PendingMovementMutation> {
  if (!activeStorageUser || activeStorageUser.id !== mutation.user_id ||
      activeStorageUser.empresa_id !== mutation.empresa_id) {
    throw new Error('No hay una sesión activa válida para guardar la operación pendiente.');
  }

  const db = await openIndexedDb();
  const syncId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `sync-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const item: PendingMovementMutation = {
    sync_id: syncId,
    entity: 'movimiento',
    action: 'CREATE',
    user_id: mutation.user_id,
    empresa_id: mutation.empresa_id,
    dispositivo_uuid: mutation.dispositivo_uuid,
    data: mutation.data,
    created_at: mutation.data.ocurrido_en,
    sequence: 0,
    status: 'PENDING',
    attempts: 0,
    last_error: null
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['pending_queue', 'metadata'], 'readwrite');
    const queueStore = tx.objectStore('pending_queue');
    const metadataStore = tx.objectStore('metadata');
    const sequenceRequest = metadataStore.get('pending_queue_sequence');
    sequenceRequest.onsuccess = () => {
      item.sequence = Number(sequenceRequest.result?.value || 0) + 1;
      metadataStore.put({ key: 'pending_queue_sequence', value: item.sequence });
      queueStore.put(item);
    };
    sequenceRequest.onerror = () => reject(sequenceRequest.error);
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo guardar la operación pendiente.'));
  });
}

/**
 * Obtiene los elementos pendientes en la cola de sincronización
 */
export async function getPendingMutations(userId?: number): Promise<PendingMovementMutation[]> {
  const targetUserId = userId ?? activeStorageUser?.id;
  if (!targetUserId) return [];

  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_queue', 'readonly');
    const req = tx.objectStore('pending_queue').index('user_id').getAll(IDBKeyRange.only(targetUserId));
    req.onsuccess = () => {
      const companyId = activeStorageUser?.id === targetUserId ? activeStorageUser.empresa_id : undefined;
      const mutations = (req.result || []).filter((mutation: PendingMovementMutation) =>
        companyId === undefined || mutation.empresa_id === companyId
      );
      resolve(mutations.sort((a: PendingMovementMutation, b: PendingMovementMutation) =>
        (a.sequence || 0) - (b.sequence || 0) || a.created_at.localeCompare(b.created_at)));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function updatePendingMutation(
  syncId: string,
  updates: Partial<Pick<PendingMovementMutation, 'status' | 'attempts' | 'last_error'>>
): Promise<void> {
  const db = await openIndexedDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('pending_queue', 'readwrite');
    const store = tx.objectStore('pending_queue');
    const request = store.get(syncId);
    request.onsuccess = () => {
      if (!request.result) {
        tx.abort();
        reject(new Error(`No se encontró la operación pendiente ${syncId}.`));
        return;
      }
      store.put({ ...request.result, ...updates });
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo actualizar la operación pendiente.'));
  });
}

export async function settlePendingMutation(
  syncId: string,
  status: 'APPLIED' | 'CONFLICT' | 'ERROR',
  options: { message?: string; productId?: number | null; stock?: number | null; proveedor?: string | null } = {}
): Promise<void> {
  const db = await openIndexedDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['pending_queue', 'api_cache'], 'readwrite');
    const queueStore = tx.objectStore('pending_queue');
    const queueRequest = queueStore.get(syncId);
    queueRequest.onsuccess = () => {
      const mutation = queueRequest.result as PendingMovementMutation | undefined;
      if (!mutation) {
        tx.abort();
        reject(new Error(`No se encontró la operación pendiente ${syncId}.`));
        return;
      }

      if (status === 'APPLIED') {
        queueStore.delete(syncId);
      } else {
        queueStore.put({
          ...mutation,
          status,
          last_error: options.message || null
        });
      }

      if (options.productId && activeStorageUser) {
        const cacheStore = tx.objectStore('api_cache');
        const cacheRequest = cacheStore.index('user_id').getAll(IDBKeyRange.only(mutation.user_id));
        cacheRequest.onsuccess = () => {
          for (const entry of cacheRequest.result as CachedApiResponse[]) {
            if (entry.empresa_id !== mutation.empresa_id) continue;
            const data = entry.data as Record<string, unknown> | null;
            if (!data) continue;
            setProductFieldsInResponse(data, options.productId!, {
              ...(options.stock !== null && options.stock !== undefined ? { stock_actual: options.stock } : {}),
              ...(options.proveedor !== undefined ? { proveedor: options.proveedor } : {})
            });
            cacheStore.put({ ...entry, data });
          }
        };
        cacheRequest.onerror = () => reject(cacheRequest.error);
      }
    };
    queueRequest.onerror = () => reject(queueRequest.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo cerrar el resultado de sincronización.'));
  });
}

export async function requeueConflictedMutation(syncId: string, stockBase: number): Promise<PendingMovementMutation> {
  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_queue', 'readwrite');
    const store = tx.objectStore('pending_queue');
    const request = store.get(syncId);
    let updatedMutation: PendingMovementMutation | null = null;
    request.onsuccess = () => {
      const mutation = request.result as PendingMovementMutation | undefined;
      if (!mutation || mutation.status !== 'CONFLICT') {
        tx.abort();
        reject(new Error('La operación ya no está en conflicto y no se puede reintentar de esta forma.'));
        return;
      }

      const newSyncId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `sync-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      updatedMutation = {
        ...mutation,
        sync_id: newSyncId,
        data: { ...mutation.data, stock_base: stockBase },
        status: 'PENDING',
        attempts: 0,
        last_error: null
      };
      store.delete(syncId);
      store.add(updatedMutation);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => {
      if (updatedMutation) resolve(updatedMutation);
      else reject(new Error('No se pudo preparar nuevamente la operación.'));
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo reintentar la operación pendiente.'));
  });
}

export async function discardBlockedMutation(syncId: string): Promise<void> {
  const db = await openIndexedDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('pending_queue', 'readwrite');
    const store = tx.objectStore('pending_queue');
    const request = store.get(syncId);
    request.onsuccess = () => {
      const mutation = request.result as PendingMovementMutation | undefined;
      if (!mutation || (mutation.status !== 'CONFLICT' && mutation.status !== 'ERROR')) {
        tx.abort();
        reject(new Error('Solo se pueden descartar operaciones bloqueadas o en conflicto.'));
        return;
      }
      store.delete(syncId);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo descartar la operación bloqueada.'));
  });
}

export async function getCachedProduct(productId: number): Promise<Product | null> {
  if (!activeStorageUser) return null;
  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'api_cache'], 'readonly');
    const productRequest = tx.objectStore('products').get(productId);
    const request = tx.objectStore('api_cache').index('user_id').getAll(IDBKeyRange.only(activeStorageUser!.id));
    let localLookupComplete = false;
    let cacheLookupComplete = false;
    let localProduct: Product | null = null;
    let cacheEntries: CachedApiResponse[] = [];
    let settled = false;

    const resolveWhenReady = () => {
      if (settled) return;
      if (localProduct) {
        settled = true;
        resolve(localProduct);
        return;
      }
      if (!localLookupComplete || !cacheLookupComplete) return;

      const entries = cacheEntries
        .filter((entry) => entry.empresa_id === activeStorageUser!.empresa_id)
        .sort((left, right) => right.cached_at.localeCompare(left.cached_at));
      for (const entry of entries) {
        const data = entry.data as { product?: Product; products?: Product[] } | null;
        const product = data?.product?.id === productId
          ? data.product
          : data?.products?.find((candidate) => candidate.id === productId);
        if (product) {
          settled = true;
          resolve(product);
          return;
        }
      }
      settled = true;
      resolve(null);
    };

    productRequest.onsuccess = () => {
      const product = productRequest.result as Product | undefined;
      if (product?.empresa_id === activeStorageUser!.empresa_id) {
        localProduct = product ?? null;
      }
      localLookupComplete = true;
      resolveWhenReady();
    };
    request.onsuccess = () => {
      cacheEntries = request.result as CachedApiResponse[];
      cacheLookupComplete = true;
      resolveWhenReady();
    };
    request.onerror = () => reject(request.error);
    productRequest.onerror = () => reject(productRequest.error);
  });
}

export async function getEffectiveCachedStock(productId: number): Promise<number | null> {
  const product = await getCachedProduct(productId);
  if (!product) return null;

  const mutations = await getPendingMutations();
  let stock = product.stock_actual;
  for (const mutation of mutations) {
    if (mutation.data.producto_id !== productId || mutation.status === 'CONFLICT' || mutation.status === 'ERROR') continue;
    if (mutation.data.tipo === 'INGRESO') stock += mutation.data.cantidad || 0;
    else if (mutation.data.tipo === 'DESPACHO') stock -= mutation.data.cantidad || 0;
    else if (mutation.data.tipo === 'AJUSTE' && mutation.data.stock_nuevo !== undefined) stock = mutation.data.stock_nuevo;
  }
  return stock;
}

function setProductFieldsInResponse(
  value: unknown,
  productId: number,
  fields: Partial<Pick<Product, 'stock_actual' | 'proveedor'>>
): void {
  if (Array.isArray(value)) {
    value.forEach((item) => setProductFieldsInResponse(item, productId, fields));
    return;
  }
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  if (record.id === productId && typeof record.stock_actual === 'number') {
    Object.assign(record, fields);
  }
  Object.values(record).forEach((item) => setProductFieldsInResponse(item, productId, fields));
}

export async function getLastSyncTimestamp(): Promise<string | null> {
  if (!activeStorageUser) return null;
  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('metadata', 'readonly');
    const request = tx.objectStore('metadata').get(getSyncCursorKey());
    request.onsuccess = () => resolve(request.result?.value || null);
    request.onerror = () => reject(request.error);
  });
}

export async function mergeInventorySnapshot(snapshot: {
  categorias: Category[];
  productos: Product[];
  movimientos: Movement[];
}): Promise<void> {
  if (!activeStorageUser?.empresa_id) return;
  const db = await openIndexedDb();
  const empresaId = activeStorageUser.empresa_id;
  const localProducts = snapshot.productos.map((product) => ({
    ...product,
    empresa_id: product.empresa_id ?? empresaId
  }));
  const localCategories = snapshot.categorias.map((category) => ({
    ...category,
    empresa_id: category.empresa_id ?? empresaId
  }));
  const localMovements = snapshot.movimientos.map((movement) => ({
    ...movement,
    empresa_id: movement.empresa_id ?? empresaId
  }));
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['api_cache', 'products', 'categories', 'movements'], 'readwrite');
    const store = tx.objectStore('api_cache');
    const request = store.index('user_id').getAll(IDBKeyRange.only(activeStorageUser!.id));
    localProducts.forEach((product) => tx.objectStore('products').put(product));
    localCategories.forEach((category) => tx.objectStore('categories').put(category));
    localMovements.forEach((movement) => tx.objectStore('movements').put(movement));
    const productById = new Map(localProducts.map((product) => [product.id, product]));
    request.onsuccess = () => {
      for (const entry of request.result as CachedApiResponse[]) {
        if (entry.empresa_id !== activeStorageUser!.empresa_id) continue;
        const data = entry.data as Record<string, unknown> | null;
        if (!data || typeof data !== 'object') continue;
        const endpoint = entry.endpoint;
        const existingMovementIds = new Set<number>();
        mergeProductsInResponse(data, productById);

        if (Array.isArray(data.categories)) {
          data.categories = localCategories;
        }
        if (Array.isArray(data.movements)) {
          const movements = data.movements as Movement[];
          movements.forEach((movement) => existingMovementIds.add(movement.id));
          const newMovements = localMovements.filter((movement) =>
            !existingMovementIds.has(movement.id) && movementMatchesEndpoint(movement, endpoint)
          );
          if (newMovements.length > 0) {
            const merged = [...movements, ...newMovements]
              .sort((left, right) =>
                `${right.fecha}T${right.hora}`.localeCompare(`${left.fecha}T${left.hora}`) || right.id - left.id
              );
            const limit = Number(new URLSearchParams(endpoint.split('?')[1] || '').get('limit'));
            data.movements = Number.isSafeInteger(limit) && limit > 0 ? merged.slice(0, limit) : merged;
            if (typeof data.total === 'number') data.total += newMovements.length;
          }
        }

        const query = endpoint.split('?')[1] || '';
        if (endpoint.startsWith('/products?') && !query && Array.isArray(data.products)) {
          const existingIds = new Set((data.products as Product[]).map((product) => product.id));
          data.products = [
            ...(data.products as Product[]),
            ...localProducts.filter((product) => !existingIds.has(product.id))
          ];
          if (typeof data.total === 'number') data.total = (data.products as Product[]).length;
        }
        store.put({ ...entry, data });
      }
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudieron aplicar los datos sincronizados.'));
  });
}

export async function getLocalInventorySnapshot(): Promise<{
  categorias: Category[];
  productos: Product[];
  movimientos: Movement[];
}> {
  const user = activeStorageUser;
  if (!user?.empresa_id) {
    throw new Error('No hay una empresa activa para crear una copia local.');
  }

  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'categories', 'movements', 'api_cache'], 'readonly');
    const productsRequest = tx.objectStore('products').getAll();
    const categoriesRequest = tx.objectStore('categories').getAll();
    const movementsRequest = tx.objectStore('movements').getAll();
    const cacheRequest = tx.objectStore('api_cache').index('user_id').getAll(IDBKeyRange.only(user.id));

    tx.oncomplete = () => {
      const productsById = new Map<number, Product>();
      const categoriesById = new Map<number, Category>();
      const movementsById = new Map<number, Movement>();

      (productsRequest.result as Product[])
        .filter((product) => product.empresa_id === user.empresa_id)
        .forEach((product) => productsById.set(product.id, product));
      (categoriesRequest.result as Category[])
        .filter((category) => category.empresa_id === user.empresa_id)
        .forEach((category) => categoriesById.set(category.id, category));
      (movementsRequest.result as Movement[])
        .filter((movement) => movement.empresa_id === user.empresa_id)
        .forEach((movement) => movementsById.set(movement.id, movement));

      const cachedEntries = (cacheRequest.result as CachedApiResponse[])
        .filter((entry) =>
          entry.empresa_id === user.empresa_id &&
          (entry.endpoint.startsWith('/products') ||
            entry.endpoint.startsWith('/categories') ||
            entry.endpoint.startsWith('/movements'))
        )
        .sort((left, right) => left.cached_at.localeCompare(right.cached_at));

      const collectCachedRecords = (value: unknown) => {
        if (Array.isArray(value)) {
          value.forEach(collectCachedRecords);
          return;
        }
        if (!isRecord(value)) return;
        if (
          isPositiveSafeInteger(value.id) &&
          typeof value.codigo === 'string' &&
          typeof value.nombre === 'string' &&
          Number.isSafeInteger(value.stock_actual)
        ) {
          productsById.set(value.id, { ...value, empresa_id: user.empresa_id } as Product);
        } else if (
          isPositiveSafeInteger(value.id) &&
          typeof value.nombre === 'string' &&
          !('producto_id' in value)
        ) {
          categoriesById.set(value.id, { ...value, empresa_id: user.empresa_id } as Category);
        } else if (
          isPositiveSafeInteger(value.id) &&
          isPositiveSafeInteger(value.producto_id) &&
          typeof value.tipo === 'string' &&
          typeof value.fecha === 'string' &&
          typeof value.hora === 'string'
        ) {
          movementsById.set(value.id, { ...value, empresa_id: user.empresa_id } as Movement);
        }
        Object.values(value).forEach(collectCachedRecords);
      };
      cachedEntries.forEach((entry) => collectCachedRecords(entry.data));

      resolve({
        productos: Array.from(productsById.values()),
        categorias: Array.from(categoriesById.values()),
        movimientos: Array.from(movementsById.values())
      });
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo leer el inventario local.'));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function assertTenantRecord(record: Record<string, unknown>, empresaId: number, label: string): void {
  if (record.empresa_id !== undefined && record.empresa_id !== null && record.empresa_id !== empresaId) {
    throw new Error(`El respaldo contiene un registro de otra empresa (${label}).`);
  }
}

function normalizeBackupCategory(record: Record<string, unknown>, empresaId: number): Category {
  assertTenantRecord(record, empresaId, 'categoría');
  if (!isPositiveSafeInteger(record.id) || typeof record.nombre !== 'string') {
    throw new Error('El respaldo contiene una categoría inválida.');
  }
  return {
    id: record.id,
    nombre: record.nombre,
    descripcion: typeof record.descripcion === 'string' ? record.descripcion : null,
    prefijo: typeof record.prefijo === 'string' ? record.prefijo : null,
    imagen: typeof record.imagen === 'string' ? record.imagen : null,
    empresa_id: empresaId
  };
}

function normalizeBackupProduct(record: Record<string, unknown>, empresaId: number): Product {
  assertTenantRecord(record, empresaId, 'producto');
  if (
    !isPositiveSafeInteger(record.id) ||
    typeof record.codigo !== 'string' ||
    typeof record.codigo_qr !== 'string' ||
    typeof record.nombre !== 'string' ||
    typeof record.unidad_medida !== 'string' ||
    !Number.isSafeInteger(record.stock_actual) ||
    Number(record.stock_actual) < 0 ||
    !Number.isSafeInteger(record.stock_minimo) ||
    Number(record.stock_minimo) < 0
  ) {
    throw new Error('El respaldo contiene un producto inválido.');
  }

  const stockActual = Number(record.stock_actual);
  const stockMinimo = Number(record.stock_minimo);
  if (
    record.categoria_id !== null &&
    record.categoria_id !== undefined &&
    !isPositiveSafeInteger(record.categoria_id)
  ) {
    throw new Error('El respaldo contiene un producto con una categoría inválida.');
  }
  const categoriaId = record.categoria_id === null || record.categoria_id === undefined
    ? null
    : record.categoria_id;

  return {
    id: record.id,
    codigo: record.codigo,
    codigo_barras: typeof record.codigo_barras === 'string' ? record.codigo_barras : null,
    codigo_qr: record.codigo_qr,
    nombre: record.nombre,
    categoria_id: categoriaId,
    categoria_nombre: typeof record.categoria_nombre === 'string' ? record.categoria_nombre : null,
    descripcion: typeof record.descripcion === 'string' ? record.descripcion : null,
    unidad_medida: record.unidad_medida,
    stock_actual: stockActual,
    stock_minimo: stockMinimo,
    ubicacion_almacen: typeof record.ubicacion_almacen === 'string' ? record.ubicacion_almacen : null,
    ubicacion_pasillo: typeof record.ubicacion_pasillo === 'string' ? record.ubicacion_pasillo : null,
    ubicacion_estante: typeof record.ubicacion_estante === 'string' ? record.ubicacion_estante : null,
    ubicacion_nivel: typeof record.ubicacion_nivel === 'string' ? record.ubicacion_nivel : null,
    proveedor: typeof record.proveedor === 'string' ? record.proveedor : null,
    imagen: typeof record.imagen === 'string' ? record.imagen : null,
    empresa_id: empresaId,
    fecha_creacion: typeof record.fecha_creacion === 'string' ? record.fecha_creacion : undefined,
    fecha_actualizacion: typeof record.fecha_actualizacion === 'string' ? record.fecha_actualizacion : undefined,
    estado: stockActual === 0 ? 'AGOTADO' : stockActual <= stockMinimo ? 'STOCK BAJO' : 'DISPONIBLE'
  };
}

function normalizeBackupMovement(record: Record<string, unknown>, empresaId: number): Movement {
  assertTenantRecord(record, empresaId, 'movimiento');
  if (
    !isPositiveSafeInteger(record.id) ||
    !isPositiveSafeInteger(record.producto_id) ||
    !['INGRESO', 'DESPACHO', 'AJUSTE'].includes(String(record.tipo).toUpperCase()) ||
    !Number.isSafeInteger(record.cantidad) ||
    !Number.isSafeInteger(record.stock_anterior) ||
    !Number.isSafeInteger(record.stock_nuevo) ||
    !isPositiveSafeInteger(record.usuario_id) ||
    typeof record.fecha !== 'string' ||
    typeof record.hora !== 'string'
  ) {
    throw new Error('El respaldo contiene un movimiento inválido.');
  }

  return {
    id: record.id,
    producto_id: record.producto_id,
    tipo: String(record.tipo).toUpperCase() as Movement['tipo'],
    cantidad: Number(record.cantidad),
    stock_anterior: Number(record.stock_anterior),
    stock_nuevo: Number(record.stock_nuevo),
    usuario_id: record.usuario_id,
    observacion: typeof record.observacion === 'string' ? record.observacion : null,
    destino: typeof record.destino === 'string' ? record.destino : null,
    motivo_ajuste: typeof record.motivo_ajuste === 'string' ? record.motivo_ajuste : null,
    guia_despacho: typeof record.guia_despacho === 'string' ? record.guia_despacho : null,
    responsable_recepcion: typeof record.responsable_recepcion === 'string' ? record.responsable_recepcion : null,
    fecha: record.fecha,
    hora: record.hora,
    empresa_id: empresaId,
    fecha_creacion: typeof record.fecha_creacion === 'string' ? record.fecha_creacion : undefined,
    producto_nombre: typeof record.producto_nombre === 'string' ? record.producto_nombre : undefined,
    producto_codigo: typeof record.producto_codigo === 'string' ? record.producto_codigo : undefined,
    producto_imagen: typeof record.producto_imagen === 'string' ? record.producto_imagen : null,
    unidad_medida: typeof record.unidad_medida === 'string' ? record.unidad_medida : undefined,
    ubicacion_almacen: typeof record.ubicacion_almacen === 'string' ? record.ubicacion_almacen : undefined,
    ubicacion_pasillo: typeof record.ubicacion_pasillo === 'string' ? record.ubicacion_pasillo : undefined,
    ubicacion_estante: typeof record.ubicacion_estante === 'string' ? record.ubicacion_estante : undefined,
    ubicacion_nivel: typeof record.ubicacion_nivel === 'string' ? record.ubicacion_nivel : undefined,
    usuario_nombre: typeof record.usuario_nombre === 'string' ? record.usuario_nombre : undefined,
    usuario_username: typeof record.usuario_username === 'string' ? record.usuario_username : undefined
  };
}

async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Este navegador no ofrece SHA-256 seguro para validar el archivo de respaldo.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function restoreLocalInventorySnapshot(snapshot: unknown): Promise<{
  checksumVerified: boolean;
  productos: number;
  categorias: number;
  movimientos: number;
}> {
  const user = activeStorageUser;
  if (!user?.empresa_id) {
    throw new Error('No hay una empresa activa para importar esta copia local.');
  }
  if (!['ADMINISTRADOR', 'SUPERADMIN'].includes(user.rol)) {
    throw new Error('Solo un administrador puede reemplazar la copia local de inventario.');
  }
  if (!isRecord(snapshot) || !isRecord(snapshot.data)) {
    throw new Error('El archivo no tiene el formato de respaldo LOGIXT esperado.');
  }
  if (
    !['LOGIXT', 'LOGIXT SaaS WMS'].includes(String(snapshot.system)) ||
    typeof snapshot.version !== 'string' ||
    !snapshot.version.startsWith('2.')
  ) {
    throw new Error('La versión o el sistema del respaldo no son compatibles.');
  }
  if (!isPositiveSafeInteger(snapshot.empresa_id) || snapshot.empresa_id !== user.empresa_id) {
    throw new Error('Este respaldo pertenece a otra empresa y no se puede importar en esta sesión.');
  }

  const checksumPresent = snapshot.checksum_sha256 !== undefined;
  if (checksumPresent && (
    typeof snapshot.checksum_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(snapshot.checksum_sha256)
  )) {
    throw new Error('El respaldo contiene un checksum SHA-256 con formato inválido.');
  }
  const checksumVerified = checksumPresent;
  if (checksumVerified) {
    const payload = { ...snapshot };
    delete payload.checksum_sha256;
    const calculated = await sha256Hex(JSON.stringify(payload));
    if (calculated !== snapshot.checksum_sha256) {
      throw new Error('La validación SHA-256 falló. El archivo está dañado o fue modificado; no se importó.');
    }
  }

  const rawCategories = snapshot.data.categorias ?? snapshot.data.categories;
  const rawProducts = snapshot.data.productos ?? snapshot.data.products;
  const rawMovements = snapshot.data.movimientos ?? snapshot.data.movements;
  if (!Array.isArray(rawCategories) || !Array.isArray(rawProducts) || !Array.isArray(rawMovements)) {
    throw new Error('El respaldo no contiene las listas completas de categorías, productos y movimientos.');
  }

  const categorias = rawCategories.map((record) => {
    if (!isRecord(record)) throw new Error('El respaldo contiene una categoría inválida.');
    return normalizeBackupCategory(record, user.empresa_id!);
  });
  const productos = rawProducts.map((record) => {
    if (!isRecord(record)) throw new Error('El respaldo contiene un producto inválido.');
    return normalizeBackupProduct(record, user.empresa_id!);
  });
  const movimientos = rawMovements.map((record) => {
    if (!isRecord(record)) throw new Error('El respaldo contiene un movimiento inválido.');
    return normalizeBackupMovement(record, user.empresa_id!);
  });

  for (const [label, records] of [
    ['categorías', categorias],
    ['productos', productos],
    ['movimientos', movimientos]
  ] as const) {
    const ids = new Set<number>();
    for (const record of records) {
      if (ids.has(record.id)) throw new Error(`El respaldo contiene IDs duplicados en ${label}.`);
      ids.add(record.id);
    }
  }

  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ['products', 'categories', 'movements', 'api_cache', 'metadata', 'pending_queue'],
      'readwrite'
    );
    let abortError: Error | null = null;
    const deleteCompanyRecords = (storeName: 'products' | 'categories' | 'movements') => {
      const request = tx.objectStore(storeName).index('empresa_id')
        .openCursor(IDBKeyRange.only(user.empresa_id!));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
    };

    const pendingRequest = tx.objectStore('pending_queue').index('user_id')
      .openCursor(IDBKeyRange.only(user.id));
    pendingRequest.onsuccess = () => {
      const cursor = pendingRequest.result;
      if (!cursor) return;
      if ((cursor.value as PendingMovementMutation).empresa_id === user.empresa_id) {
        abortError = new Error('Primero sincroniza o descarta los movimientos pendientes antes de reemplazar los datos locales.');
        tx.abort();
        return;
      }
      cursor.continue();
    };

    deleteCompanyRecords('products');
    deleteCompanyRecords('categories');
    deleteCompanyRecords('movements');

    const cacheCursor = tx.objectStore('api_cache').index('user_id')
      .openCursor(IDBKeyRange.only(user.id));
    cacheCursor.onsuccess = () => {
      const cursor = cacheCursor.result;
      if (!cursor) return;
      const cache = cursor.value as CachedApiResponse;
      if (
        cache.empresa_id === user.empresa_id &&
        (cache.endpoint.startsWith('/products') ||
          cache.endpoint.startsWith('/categories') ||
          cache.endpoint.startsWith('/movements') ||
          cache.endpoint === '/dashboard/summary')
      ) {
        cursor.delete();
      }
      cursor.continue();
    };

    productos.forEach((product) => tx.objectStore('products').put(product));
    categorias.forEach((category) => tx.objectStore('categories').put(category));
    movimientos.forEach((movement) => tx.objectStore('movements').put(movement));
    tx.objectStore('metadata').delete(getSyncCursorKey());

    tx.oncomplete = () => resolve({
      checksumVerified,
      productos: productos.length,
      categorias: categorias.length,
      movimientos: movimientos.length
    });
    tx.onerror = () => reject(abortError || tx.error || new Error('No se pudo restaurar la copia en IndexedDB.'));
    tx.onabort = () => reject(abortError || tx.error || new Error('No se pudo restaurar la copia en IndexedDB.'));
  });
}

export async function setLastSyncTimestamp(timestamp: string): Promise<void> {
  if (!activeStorageUser) {
    throw new Error('No se puede guardar el cursor de sincronización sin una sesión activa.');
  }
  const db = await openIndexedDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('metadata', 'readwrite');
    tx.objectStore('metadata').put({ key: getSyncCursorKey(), value: timestamp });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo guardar la fecha de sincronización.'));
  });
}

function getSyncCursorKey(): string {
  if (!activeStorageUser) throw new Error('No hay una sesión activa para obtener el cursor de sincronización.');
  return `last_inventory_sync:${activeStorageUser.id}:${activeStorageUser.empresa_id ?? 'platform'}`;
}

function mergeProductsInResponse(value: unknown, productById: Map<number, Product>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => mergeProductsInResponse(item, productById));
    return;
  }
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  if (typeof record.id === 'number' && typeof record.stock_actual === 'number') {
    const syncedProduct = productById.get(record.id);
    if (syncedProduct) Object.assign(record, syncedProduct);
  }
  Object.values(record).forEach((item) => mergeProductsInResponse(item, productById));
}

function movementMatchesEndpoint(movement: Movement, endpoint: string): boolean {
  const query = new URLSearchParams(endpoint.split('?')[1] || '');
  const productId = query.get('producto_id');
  const type = query.get('tipo');
  const userId = query.get('usuario_id') || query.get('user_id');
  const dateFrom = query.get('fecha_desde');
  const dateTo = query.get('fecha_hasta');
  const search = query.get('search')?.toLocaleLowerCase();
  const searchableText = [
    movement.producto_nombre,
    movement.producto_codigo,
    movement.destino,
    movement.observacion,
    movement.usuario_nombre,
    movement.guia_despacho,
    movement.responsable_recepcion
  ].filter(Boolean).join(' ').toLocaleLowerCase();
  return (!productId || movement.producto_id === Number(productId)) &&
    (!type || movement.tipo.toUpperCase() === type.toUpperCase()) &&
    (!userId || movement.usuario_id === Number(userId)) &&
    (!dateFrom || movement.fecha >= dateFrom) &&
    (!dateTo || movement.fecha <= dateTo) &&
    (!search || searchableText.includes(search));
}

/**
 * Guarda o descarga físicamente una copia de seguridad en el equipo local
 */
export async function exportSnapshotToLocalFolder(
  snapshotData: any,
  suggestedFileName?: string
): Promise<{ success: boolean; writtenToFolder: boolean; fileName: string; fallbackReason?: string }> {
  if (!isRecord(snapshotData)) {
    throw new Error('No se pudo crear el respaldo: los datos tienen un formato inválido.');
  }
  const payload = { ...snapshotData };
  delete payload.checksum_sha256;
  const checksum = await sha256Hex(JSON.stringify(payload));
  const jsonContent = JSON.stringify({ ...payload, checksum_sha256: checksum }, null, 2);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const fileName = suggestedFileName || `logixt-respaldo-local-${dateStr}.json`;
  let fallbackReason: string | undefined;

  // 1. Si tenemos un manejador activo de carpeta de File System Access API
  if (activeDirectoryHandle) {
    try {
      const fileHandle = await activeDirectoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(jsonContent);
      await writable.close();

      // Guardar también copia con el inventario actual
      const activeHandle = await activeDirectoryHandle.getFileHandle('logixt-inventario-actual.json', { create: true });
      const activeWritable = await activeHandle.createWritable();
      await activeWritable.write(jsonContent);
      await activeWritable.close();

      return { success: true, writtenToFolder: true, fileName };
    } catch (err) {
      fallbackReason = err instanceof Error
        ? err.message
        : 'No se pudo escribir en la carpeta seleccionada.';
      console.warn('No se pudo escribir directamente en la carpeta asignada:', err);
    }
  }

  // 2. Fallback: descarga directa en el navegador
  try {
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true, writtenToFolder: false, fileName, fallbackReason };
  } catch (err: any) {
    throw new Error(`No se pudo exportar el archivo local: ${err.message}`);
  }
}

/**
 * Comprueba si el dispositivo tiene conexión a internet
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
