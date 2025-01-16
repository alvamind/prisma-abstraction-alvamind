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
      // Fallback to direct database query on cache failure
      return fn();
    }
  }

  public findUnique = async (
    args: Parameters<InstanceType<T>[Model]['findUnique']>[0]
  ) => {
    const cacheKey = `${this.model.$name}:unique:${JSON.stringify(args)}`;
    return this.withCache(
      cacheKey,
      async () => await BaseRepository.prototype.findUnique.call(this, args)
    );
  };

  public override update = async (
    args: Parameters<InstanceType<T>[Model]['update']>[0]
  ) => {
    const result = await this.getClient().update(args);
    await this.invalidateCache();
    this.currentTrx = undefined;
    return result;
  };

  protected async invalidateCache(): Promise<void> {
    try {
      // Invalidate all cached entries for this model
      const cachePattern = `${this.cacheKeyPrefix}*`;
      await this.cache.delete(cachePattern);
    } catch (e) {
      getConfig().logger?.error(`Cache invalidation failed: ${e}`);
    }
  }
}

// Add more cached methods as needed
