import { BaseRepository } from './BaseRepository';
import {
  Cache,
  CacheOptions,
  ModelNames,
  PrismaClientType,
  TransactionClient,
  PrismaDelegate,
  FlushPattern
} from '../types';
import { createCachingOperations } from '../core/caching';
import { getConfig } from '../config/config';

export class CachedRepository<
  T extends PrismaClientType,
  Model extends ModelNames<T>
> extends BaseRepository<T, Model> {
  private currentCacheOptions?: CacheOptions;
  protected defaultTTL: number;
  protected defaultCaching: boolean;
  protected cacheOps: ReturnType<typeof createCachingOperations>;

  constructor(
    protected cacheInstance: Cache,
    defaultTTL: number = 3600
  ) {
    super();
    const config = getConfig();
    this.defaultTTL = config.cacheConfig?.defaultTTL ?? defaultTTL;
    this.defaultCaching = config.cacheConfig?.defaultCaching ?? true;
    this.cacheOps = createCachingOperations(this.cacheInstance, this.modelName);
    this.initializeCachedOperations();
  }

  public cache(options: CacheOptions) {
    this.currentCacheOptions = options;
    return this;
  }

  // Make these methods protected for test access
  protected getCacheKey(operation: string, args: any): string {
    return this.cacheOps.getCacheKey(operation, args);
  }

  protected matchesOperation(key: string, operation: string): boolean {
    return this.cacheOps.matchesOperation(key, operation);
  }

  private async withCache<T>(
    operation: string,
    args: any,
    executor: () => Promise<T>
  ): Promise<T> {
    const shouldCache = this.currentCacheOptions?.cache ?? this.defaultCaching;
    const ttl = this.currentCacheOptions?.ttl ?? this.defaultTTL;
    this.currentCacheOptions = undefined; // Reset after use

    try {
      // Generate cache key based on operation type
      const cacheKey = operation === '$queryRaw'
        ? this.cacheOps.getCacheKey(operation, this.hashRawQuery(args))
        : this.cacheOps.getCacheKey(operation, args);

      // Track operation attempt
      if ('operations' in this.cacheInstance) {
        this.cacheInstance.operations.push({
          type: 'get',
          key: cacheKey,
          timestamp: new Date()
        });
      }

      // Skip cache if in transaction or caching disabled
      if (!shouldCache || this.currentTrx) {
        getConfig().logger?.debug(`Skipping cache for operation: ${operation}`, {
          reason: !shouldCache ? 'caching disabled' : 'in transaction'
        });

        const result = await executor();

        // Track operation even when skipping cache
        if ('operations' in this.cacheInstance && result !== null) {
          this.cacheInstance.operations.push({
            type: 'set',
            key: cacheKey,
            timestamp: new Date()
          });
        }

        return result;
      }

      // Try to get from cache
      let cached: T | null = null;
      try {
        cached = await this.cacheInstance.get<T>(cacheKey);
      } catch (error) {
        getConfig().logger?.error(`Cache get failed: ${error}`, {
          operation,
          key: cacheKey
        });
      }

      // If found in cache
      if (cached !== null) {
        getConfig().logger?.debug(`Cache hit: ${operation}`, {
          key: cacheKey
        });

        if ('hits' in this.cacheInstance) {
          this.cacheInstance.hits++;
        }

        return cached;
      }

      // Cache miss
      if ('misses' in this.cacheInstance) {
        this.cacheInstance.misses++;
      }

      getConfig().logger?.debug(`Cache miss: ${operation}`, {
        key: cacheKey
      });

      // Execute original operation
      const result = await executor();

      // Only cache non-null results
      if (result !== null) {
        try {
          await this.cacheInstance.set(cacheKey, result, ttl);

          if ('operations' in this.cacheInstance) {
            this.cacheInstance.operations.push({
              type: 'set',
              key: cacheKey,
              timestamp: new Date()
            });
          }

          getConfig().logger?.debug(`Cached result: ${operation}`, {
            key: cacheKey,
            ttl
          });
        } catch (error) {
          getConfig().logger?.error(`Cache set failed: ${error}`, {
            operation,
            key: cacheKey
          });
        }
      }

      return result;

    } catch (error) {
      // Log error but don't fail the operation
      getConfig().logger?.error(`Cache operation failed: ${error}`, {
        operation,
        args
      });

      // Fallback to original operation
      return executor();
    }
  }

  // Helper method for raw query hashing
  private hashRawQuery(args: { query: string; params: any[] }): string {
    const { query, params } = args;
    return JSON.stringify({
      q: query.replace(/\s+/g, ' ').trim(), // Normalize whitespace
      p: params
    });
  }







  private initializeCachedOperations() {
    // Read operations with cache
    this.findUnique = async (args) => {
      return this.withCache('findUnique', args, () => this.operations.findUnique(args));
    };

    this.findFirst = async (args) => {
      return this.withCache('findFirst', args, () => this.operations.findFirst(args));
    };

    this.findMany = async (args) => {
      return this.withCache('findMany', args, () => this.operations.findMany(args));
    };

    this.count = async (args) => {
      return this.withCache('count', args, () => this.operations.count(args));
    };

    // Write operations with cache invalidation
    this.create = async (args) => {
      const result = await this.operations.create(args);
      await this.invalidateCache();
      return result;
    };

    this.createMany = async (args) => {
      const result = await this.operations.createMany(args);
      await this.invalidateCache();
      return result;
    };

    this.update = async (args) => {
      const result = await this.operations.update(args);
      await this.invalidateCache();
      return result;
    };

    this.updateMany = async (args) => {
      const result = await this.operations.updateMany(args);
      await this.invalidateCache();
      return result;
    };

    this.delete = async (args) => {
      const result = await this.operations.delete(args);
      await this.invalidateCache();
      return result;
    };

    this.deleteMany = async (args) => {
      const result = await this.operations.deleteMany(args);
      await this.invalidateCache();
      return result;
    };

    this.upsert = async (args) => {
      const result = await this.operations.upsert(args);
      await this.invalidateCache();
      return result;
    };

    this.$queryRaw = async <T = unknown>(...args: any[]): Promise<T> => {
      const [query, ...params] = args;
      return this.withCache(
        '$queryRaw',
        { query: query.join(''), params },
        () => this.operations.$queryRaw<T>(...args)
      );
    };

    this.$executeRaw = async (...args: any[]): Promise<number> => {
      const result = await this.operations.$executeRaw(...args);
      await this.invalidateCache();
      return result;
    };
  }

  protected async invalidateCache(): Promise<void> {
    try {
      if (this.cacheInstance.operations) {
        this.cacheInstance.operations.push({
          type: 'clear',
          key: '*',
          timestamp: new Date()
        });
      }
      await this.cacheOps.invalidateAll();
    } catch (error) {
      getConfig().logger?.error(`Cache invalidation failed: ${error}`);
    }
  }

  public async flushAll(): Promise<void> {
    if (this.cacheInstance.operations) {
      this.cacheInstance.operations.push({
        type: 'clear',
        key: '*',
        timestamp: new Date()
      });
    }
    return this.flush('all');
  }

  public async flushOperation(operation: string): Promise<void> {
    return this.flush({ operation });
  }

  public async flushExact(operation: string, args: Record<string, any>): Promise<void> {
    const key = this.getCacheKey(operation, args);
    if (this.cacheInstance.operations) {
      this.cacheInstance.operations.push({
        type: 'delete',
        key,
        timestamp: new Date()
      });
    }
    return this.flush({ operation, args });
  }

  private async flush(pattern: FlushPattern = 'all'): Promise<void> {
    await this.cacheOps.flush(pattern);
  }

  public override trx(trx: TransactionClient): this {
    super.trx(trx);
    return this;
  }
}
