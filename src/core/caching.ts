// src/core/caching.ts
import { Cache, CacheError, FlushPattern } from '../types';
import { defaultSanitizeKey, createCachePattern, hashQuery } from '../utils/utils';
import { getConfig } from '../config/config';

export function createCachingOperations(
  cache: Cache,
  modelName: string,
) {
  const getCacheKey = (operation: string, args: any): string => {
    const key = `${modelName.toLowerCase()}:${operation.toLowerCase()}:${JSON.stringify(args)}`;

    const config = getConfig();
    if (config.cacheConfig?.cacheKeySanitizer) {
      const sanitized = config.cacheConfig.cacheKeySanitizer(key);
      if (sanitized) return sanitized;
    }

    return defaultSanitizeKey(key);
  };

  const decodeKey = (key: string): string => {
    const config = getConfig();
    if (config.cacheConfig?.cacheKeySanitizer) {
      return key;
    }

    try {
      return Buffer.from(key, 'base64url').toString();
    } catch {
      return key;
    }
  };

  const matchesOperation = (key: string, operation: string): boolean => {
    const operationPattern = `${modelName.toLowerCase()}:${operation.toLowerCase()}:`;
    const decodedKey = decodeKey(key).toLowerCase();
    return decodedKey.includes(operationPattern);
  };

  return {
    // Core cache operations
    async get<T>(operation: string, args: any): Promise<T | null> {
      try {
        const key = getCacheKey(operation, args);
        const result = await cache.get<T>(key);
        getConfig().logger?.debug(`Cache get: ${key}`, { hit: result !== null });
        return result;
      } catch (error) {
        getConfig().logger?.error(`Cache get failed: ${error}`);
        return null;
      }
    },

    async set<T>(operation: string, args: any, value: T, ttl?: number): Promise<void> {
      try {
        const key = getCacheKey(operation, args);
        await cache.set(key, value, ttl);
        getConfig().logger?.debug(`Cache set: ${key}`, { ttl });
      } catch (error) {
        getConfig().logger?.error(`Cache set failed: ${error}`);
        throw new CacheError('Failed to set cache value', error as Error);
      }
    },

    async delete(key: string): Promise<void> {
      try {
        await cache.delete(key);
        getConfig().logger?.debug(`Cache delete: ${key}`);
      } catch (error) {
        getConfig().logger?.error(`Cache delete failed: ${error}`);
        throw new CacheError('Failed to delete cache entry', error as Error);
      }
    },

    // Cache invalidation operations
    async invalidate(operation?: string): Promise<void> {
      try {
        const pattern = createCachePattern(modelName, operation);
        const keys = await cache.keys();
        const keysToDelete = keys.filter(key => {
          if (operation) {
            return matchesOperation(key, operation);
          }
          return key.startsWith(`${modelName.toLowerCase()}:`);
        });

        await Promise.all(keysToDelete.map(key => cache.delete(key)));
        getConfig().logger?.debug(`Cache invalidate: ${pattern}`, { keysDeleted: keysToDelete.length });
      } catch (error) {
        getConfig().logger?.error(`Cache invalidation failed: ${error}`);
        throw new CacheError('Failed to invalidate cache', error as Error);
      }
    },

    async invalidateAll(): Promise<void> {
      try {
        await cache.clear();
        getConfig().logger?.debug('Cache cleared');
      } catch (error) {
        getConfig().logger?.error(`Cache clear failed: ${error}`);
        throw new CacheError('Failed to clear cache', error as Error);
      }
    },

    async flush(pattern: FlushPattern = 'all'): Promise<void> {
      try {
        if (pattern === 'all') {
          await this.invalidateAll();
          return;
        }

        const { operation, args } = pattern;

        if (operation) {
          if (args) {
            const cacheKey = getCacheKey(operation, args);
            await this.delete(cacheKey);
          } else {
            await this.invalidate(operation);
          }
        } else {
          await this.invalidate();
        }
      } catch (error) {
        getConfig().logger?.error(`Cache flush failed: ${error}`);
        throw new CacheError('Failed to flush cache', error as Error);
      }
    },

    // Raw query cache operations
    async getRaw<T>(query: string, params: any[] = []): Promise<T | null> {
      try {
        const key = hashQuery(query, params);
        return await cache.get<T>(key);
      } catch (error) {
        getConfig().logger?.error(`Cache getRaw failed: ${error}`);
        return null;
      }
    },

    async setRaw<T>(query: string, params: any[] = [], value: T, ttl?: number): Promise<void> {
      try {
        const key = hashQuery(query, params);
        await cache.set(key, value, ttl);
      } catch (error) {
        getConfig().logger?.error(`Cache setRaw failed: ${error}`);
        throw new CacheError('Failed to set raw query cache', error as Error);
      }
    },

    // Helper methods
    async exists(operation: string, args: any): Promise<boolean> {
      try {
        const key = getCacheKey(operation, args);
        const value = await cache.get(key);
        return value !== null;
      } catch (error) {
        getConfig().logger?.error(`Cache exists check failed: ${error}`);
        return false;
      }
    },

    async keys(operation?: string): Promise<string[]> {
      try {
        const allKeys = await cache.keys();
        if (!operation) {
          return allKeys;
        }
        return allKeys.filter(key => matchesOperation(key, operation));
      } catch (error) {
        getConfig().logger?.error(`Cache keys operation failed: ${error}`);
        return [];
      }
    },

    // Utility methods
    getCacheKey,
    decodeKey,
    matchesOperation,
  };
}

export type CachingOperations = ReturnType<typeof createCachingOperations>;

// Helper types
export interface CacheResult<T> {
  hit: boolean;
  value: T | null;
}

export interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
}

// Cache operation types
export type CacheGet = <T>(key: string) => Promise<T | null>;
export type CacheSet = <T>(key: string, value: T, ttl?: number) => Promise<void>;
export type CacheDelete = (key: string) => Promise<void>;
export type CacheClear = () => Promise<void>;
export type CacheKeys = () => Promise<string[]>;

export interface CacheOperations {
  get: CacheGet;
  set: CacheSet;
  delete: CacheDelete;
  clear: CacheClear;
  keys: CacheKeys;
}
