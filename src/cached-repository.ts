// src/cached-repository.ts
import { BaseRepository } from './base-repository';
import { getConfig } from './config';
import { ModelNames, PrismaClientType, Cache } from './types';

export abstract class CachedRepository<T extends PrismaClientType, Model extends ModelNames<T>> extends BaseRepository<T, Model> {
  private cacheKeyPrefix: string;

  constructor(
    protected cache: Cache,
    protected defaultTTL: number = 3600
  ) {
    super();
    this.cacheKeyPrefix = `${this.model.$name}:`;
  }

  protected generateCacheKey(operation: string, args: any): string {
    return `${this.cacheKeyPrefix}${operation}:${JSON.stringify(args)}`;
  }

  protected async withCache<P>(
    key: string,
    fn: () => Promise<P>,
    ttl: number = this.defaultTTL
  ): Promise<P> {
    try {
      const cached = await this.cache.get<P>(key);
      if (cached !== null) return cached;

      const result = await fn();
      if (result !== null && result !== undefined) {
        await this.cache.set(key, result, ttl);
      }
      return result;
    } catch (e) {
      getConfig().logger?.error(`Cache operation failed: ${e}`);
      return fn();
    }
  }

  public override async findUnique(
    args: Parameters<InstanceType<T>[Model]['findUnique']>[0]
  ) {
    const cacheKey = this.generateCacheKey('findUnique', args);
    return this.withCache(
      cacheKey,
      () => super.findUnique(args)
    );
  }

  public override async update<UpdateArgs extends Record<string, any>>(
    args: UpdateArgs
  ) {
    // First perform the update
    const result = await super.update(args);

    // Generate cache key for the specific record
    const cacheKey = this.generateCacheKey('findUnique', { where: args['where'] });
    await this.cache.delete(cacheKey);

    // Also invalidate any list caches
    await this.invalidateListCaches();

    return result;
  }

  protected async invalidateListCaches(): Promise<void> {
    try {
      // Delete any cache entries that contain lists of records
      const listCacheKey = `${this.cacheKeyPrefix}findMany:*`;
      await this.cache.delete(listCacheKey);
    } catch (e) {
      getConfig().logger?.error(`Cache invalidation failed: ${e}`);
    }
  }

  protected async invalidateCache(): Promise<void> {
    try {
      // Delete all cache entries for this model
      await this.cache.delete(`${this.cacheKeyPrefix}*`);
    } catch (e) {
      getConfig().logger?.error(`Cache invalidation failed: ${e}`);
    }
  }
}
