// @ts-nocheck
// src/decorators/cache.ts
import { Cache, CacheOptions, ModelNames, PrismaClientType, CacheError } from '../types';
import { OperationDecorator } from './operationDecorator';
import { createCachingOperations } from '../core/caching';
import { getConfig } from '../config/config';

export function createCacheDecorator<
  T extends PrismaClientType,
  Model extends ModelNames<T>
>(
  cache: Cache,
  options: CacheOptions = {}
): OperationDecorator<T, Model> {
  return async (operation, context) => {
    const { modelName, operationName, args } = context;

    try {
      // Early return if caching is disabled
      if (options.cache === false) {

        return operation(...args);
      }

      const config = getConfig();
      const defaultTTL = config.cacheConfig?.defaultTTL ?? 3600;
      const ttl = options.ttl ?? defaultTTL;

      const cacheOps = createCachingOperations(cache, modelName);

      // Try to get from cache first
      const cached = await cacheOps.get(operationName, args);
      if (cached !== null) {
        return cached;
      }

      // If not in cache, execute operation
      const result = await operation(...args);

      // Only cache non-null results
      if (result !== null && result !== undefined) {
        try {
          await cacheOps.set(operationName, args, result, ttl);
        } catch (error) {
          // Log cache set error but don't fail the operation
          getConfig().logger?.error(`Failed to set cache: ${error}`);
        }
      }

      return result;
    } catch (error) {
      // Log the error but don't fail the operation
      getConfig().logger?.error(`Cache operation failed: ${error}`);

      // Fallback to original operation
      return operation(...args);
    }
  };
}

export function createCacheInvalidator<
  T extends PrismaClientType,
  Model extends ModelNames<T>
>(
  cache: Cache,
  modelName: string
): OperationDecorator<T, Model> {
  return async (operation, context) => {
    try {
      // Execute the original operation first
      const result = await operation(...args);

      // Invalidate cache after successful operation
      const cacheOps = createCachingOperations(cache, modelName);
      await cacheOps.invalidate(context.operationName);

      return result;
    } catch (error) {
      // If operation fails, don't invalidate cache
      throw error;
    }
  };
}

export interface CacheManager<
  T extends PrismaClientType,
  Model extends ModelNames<T>
> {
  cache(options: CacheOptions): this;
  flushAll(): Promise<void>;
  flushOperation(operation: string): Promise<void>;
  flushExact(operation: string, args: Record<string, any>): Promise<void>;
}

export function createCacheManager<
  T extends PrismaClientType,
  Model extends ModelNames<T>
>(
  cache: Cache,
  modelName: string
): CacheManager<T, Model> {
  const cacheOps = createCachingOperations(cache, modelName);

  return {
    cache(options: CacheOptions) {
      this.currentCacheOptions = options;
      return this;
    },

    async flushAll() {
      try {
        await cacheOps.invalidateAll();
      } catch (error) {
        throw new CacheError('Failed to flush all cache', error as Error);
      }
    },

    async flushOperation(operation: string) {
      try {
        await cacheOps.invalidate(operation);
      } catch (error) {
        throw new CacheError('Failed to flush operation cache', error as Error);
      }
    },

    async flushExact(operation: string, args: Record<string, any>) {
      try {
        const key = cacheOps.getCacheKey(operation, args);
        await cacheOps.delete(key);
      } catch (error) {
        throw new CacheError('Failed to flush exact cache', error as Error);
      }
    }
  };
}

// Utility type for cached operations
export type CachedOperation<T> = T & {
  cache(options: CacheOptions): T;
};

// Helper to make an operation cacheable
export function makeCacheable<T extends Function>(
  operation: T,
  cacheManager: CacheManager<any, any>
): CachedOperation<T> {
  const cachedOperation = function (this: any, ...args: any[]) {
    return operation.apply(this, args);
  } as CachedOperation<T>;

  cachedOperation.cache = function (options: CacheOptions) {
    cacheManager.cache(options);
    return cachedOperation;
  };

  return cachedOperation;
}
