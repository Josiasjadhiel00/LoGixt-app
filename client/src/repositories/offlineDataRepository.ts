import { Category, Movement, Product, User } from '../types';
import {
  cacheApiResponse,
  clearOfflineUser,
  getEffectiveCachedStock,
  getCachedApiResponse,
  getPendingMutations,
  getLastSyncTimestamp,
  getOfflineUser,
  mergeInventorySnapshot,
  PendingMovementMutation,
  queueOfflineMutation,
  requeueConflictedMutation,
  discardBlockedMutation,
  saveOfflineUser,
  setActiveStorageUser,
  settlePendingMutation,
  updatePendingMutation,
  setLastSyncTimestamp
} from '../services/localStorageDb';

export interface OfflineDataRepository {
  setActiveUser(user: User | null): void;
  saveUser(user: User): Promise<void>;
  getUser(): Promise<User | null>;
  saveResponse(endpoint: string, data: unknown): Promise<void>;
  getResponse<T>(endpoint: string): Promise<T | null>;
  clearUser(userId: number): Promise<void>;
  enqueueMovement(mutation: Omit<PendingMovementMutation, 'sync_id' | 'entity' | 'action' | 'created_at' | 'sequence' | 'status' | 'attempts' | 'last_error'>): Promise<PendingMovementMutation>;
  getPendingMutations(userId?: number): Promise<PendingMovementMutation[]>;
  updatePendingMutation(syncId: string, updates: Partial<Pick<PendingMovementMutation, 'status' | 'attempts' | 'last_error'>>): Promise<void>;
  getEffectiveCachedStock(productId: number): Promise<number | null>;
  getLastSyncTimestamp(): Promise<string | null>;
  mergeInventorySnapshot(snapshot: { categorias: Category[]; productos: Product[]; movimientos: Movement[] }): Promise<void>;
  setLastSyncTimestamp(timestamp: string): Promise<void>;
  settlePendingMutation(syncId: string, status: 'APPLIED' | 'CONFLICT' | 'ERROR', options?: { message?: string; productId?: number | null; stock?: number | null; proveedor?: string | null }): Promise<void>;
  requeueConflictedMutation(syncId: string, stockBase: number): Promise<PendingMovementMutation>;
  discardBlockedMutation(syncId: string): Promise<void>;
}

export class IndexedDbOfflineDataRepository implements OfflineDataRepository {
  setActiveUser(user: User | null): void {
    setActiveStorageUser(user);
  }

  saveUser(user: User): Promise<void> {
    return saveOfflineUser(user);
  }

  getUser(): Promise<User | null> {
    return getOfflineUser();
  }

  saveResponse(endpoint: string, data: unknown): Promise<void> {
    return cacheApiResponse(endpoint, data);
  }

  getResponse<T>(endpoint: string): Promise<T | null> {
    return getCachedApiResponse<T>(endpoint);
  }

  clearUser(userId: number): Promise<void> {
    return clearOfflineUser(userId);
  }

  enqueueMovement(
    mutation: Omit<PendingMovementMutation, 'sync_id' | 'entity' | 'action' | 'created_at' | 'sequence' | 'status' | 'attempts' | 'last_error'>
  ): Promise<PendingMovementMutation> {
    return queueOfflineMutation(mutation);
  }

  getPendingMutations(userId?: number): Promise<PendingMovementMutation[]> {
    return getPendingMutations(userId);
  }

  updatePendingMutation(
    syncId: string,
    updates: Partial<Pick<PendingMovementMutation, 'status' | 'attempts' | 'last_error'>>
  ): Promise<void> {
    return updatePendingMutation(syncId, updates);
  }

  getEffectiveCachedStock(productId: number): Promise<number | null> {
    return getEffectiveCachedStock(productId);
  }

  getLastSyncTimestamp(): Promise<string | null> {
    return getLastSyncTimestamp();
  }

  mergeInventorySnapshot(snapshot: { categorias: Category[]; productos: Product[]; movimientos: Movement[] }): Promise<void> {
    return mergeInventorySnapshot(snapshot);
  }

  setLastSyncTimestamp(timestamp: string): Promise<void> {
    return setLastSyncTimestamp(timestamp);
  }

  settlePendingMutation(
    syncId: string,
    status: 'APPLIED' | 'CONFLICT' | 'ERROR',
    options?: { message?: string; productId?: number | null; stock?: number | null; proveedor?: string | null }
  ): Promise<void> {
    return settlePendingMutation(syncId, status, options);
  }

  requeueConflictedMutation(syncId: string, stockBase: number): Promise<PendingMovementMutation> {
    return requeueConflictedMutation(syncId, stockBase);
  }

  discardBlockedMutation(syncId: string): Promise<void> {
    return discardBlockedMutation(syncId);
  }
}

export const offlineDataRepository: OfflineDataRepository =
  new IndexedDbOfflineDataRepository();
