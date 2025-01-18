// src/facade/CachedRepository.ts
import { BaseRepository } from './BaseRepository';
import {
  Cache,
  CacheOptions,
  ModelNames,
  PrismaClientType,
  TransactionClient,
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

  public cache(options: CacheOptions): this {
    this.currentCacheOptions = options;
    return this;
  }

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
    this.currentCacheOptions = undefined;

    try {
      const cacheKey = this.getCacheKey(operation, args);

      if (!shouldCache || this.currentTrx) {
        if (this.cacheInstance?.operations) {
          this.cacheInstance.operations.push({
            type: 'get',
            key: cacheKey,
            timestamp: new Date()
          });
        }

        const result = await executor();

        if (this.cacheInstance?.operations && result !== null) {
          this.cacheInstance.operations.push({
            type: 'set',
            key: cacheKey,
            timestamp: new Date()
          });
        }

        return result;
      }

      const cached = await this.cacheInstance.get<T>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const result = await executor();

      if (result !== null && result !== undefined) {
        await this.cacheInstance.set(cacheKey, result, ttl);
      }

      return result;
    } catch (error) {
      return executor();
    }
  }

  private initializeCachedOperations() {
    // Read operations with cache
    // @ts-ignore - Maintain Prisma's exact method shape
    this.findUnique = async (args) => {
      return this.withCache('findUnique', args, () => this.operations.findUnique(args));
    };

    // @ts-ignore - Maintain Prisma's exact method shape
    this.findFirst = async (args) => {
      return this.withCache('findFirst', args, () => this.operations.findFirst(args));
    };

    // @ts-ignore - Maintain Prisma's exact method shape
    this.findMany = async (args) => {
      return this.withCache('findMany', args, () => this.operations.findMany(args));
    };

    // @ts-ignore - Maintain Prisma's exact method shape
    this.count = async (args) => {
      return this.withCache('count', args, () => this.operations.count(args));
    };

    // Write operations with cache invalidation
    // @ts-ignore - Maintain Prisma's exact method shape
    this.create = async (args) => {
      const result = await this.operations.create(args);
      await this.invalidateCache();
      return result;
    };

    // @ts-ignore - Maintain Prisma's exact method shape
    this.createMany = async (args) => {
      const result = await this.operations.createMany(args);
      await this.invalidateCache();
      return result;
    };

    // @ts-ignore - Maintain Prisma's exact method shape
    this.update = async (args) => {
      const result = await this.operations.update(args);
      await this.invalidateCache();
      return result;
    };

    // @ts-ignore - Maintain Prisma's exact method shape
    this.updateMany = async (args) => {
      const result = await this.operations.updateMany(args);
      await this.invalidateCache();
      return result;
    };

    // @ts-ignore - Maintain Prisma's exact method shape
    this.delete = async (args) => {
      const result = await this.operations.delete(args);
      await this.invalidateCache();
      return result;
    };

    // @ts-ignore - Maintain Prisma's exact method shape
    this.deleteMany = async (args) => {
      const result = await this.operations.deleteMany(args);
      await this.invalidateCache();
      return result;
    };

    // @ts-ignore - Maintain Prisma's exact method shape
    this.upsert = async (args) => {
      const result = await this.operations.upsert(args);
      await this.invalidateCache();
      return result;
    };

    // Raw operations with cache
    this.$queryRaw = async <T = unknown>(...args: any[]): Promise<T> => {
      const [query, ...params] = args;
      return this.withCache(
        '$queryRaw',
        { query: query.join(''), params },
        // @ts-ignore
        () => this.operations.$queryRaw<T>(...args)
      );
    };

    this.$executeRaw = async (...args: any[]): Promise<number> => {
      // @ts-ignore
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
