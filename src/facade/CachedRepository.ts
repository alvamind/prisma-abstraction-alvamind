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
      // Skip cache if in transaction
      if (!shouldCache || this.currentTrx) {
        return await executor();
      }

      const cacheKey = this.getCacheKey(operation, args);
      const cached = await this.cacheInstance.get<T>(cacheKey);

      // Track get operation
      if (this.cacheInstance.operations) {
        this.cacheInstance.operations.push({
          type: 'get',
          key: cacheKey,
          timestamp: new Date()
        });
      }

      if (cached !== null) {
        return cached;
      }

      const result = await executor();

      if (result !== null) {
        await this.cacheInstance.set(cacheKey, result, ttl);
        // Track set operation
        if (this.cacheInstance.operations) {
          this.cacheInstance.operations.push({
            type: 'set',
            key: cacheKey,
            timestamp: new Date()
          });
        }
      }

      return result;
    } catch (error) {
      getConfig().logger?.error(`Cache operation failed: ${error}`);
      return executor();
    }
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
