// src/cached-repository.ts
import { Sql } from '@prisma/client/runtime/library';
import { BaseRepository } from './base-repository';
import { getConfig } from './config';
import { ModelNames, PrismaClientType, Cache, CacheOptions, CacheError, FlushPattern } from './types';

export abstract class CachedRepository<T extends PrismaClientType, Model extends ModelNames<T>> extends BaseRepository<T, Model> {
  protected defaultTTL: number;
  protected defaultCaching: boolean;

  constructor(
    protected cache: Cache,
    defaultTTL: number = 3600 // 1 hour default
  ) {
    super();
    const config = getConfig();
    this.defaultTTL = config.cache?.defaultTTL ?? defaultTTL;
    this.defaultCaching = config.cache?.defaultCaching ?? true;
  }

  // Modified cacheRead method to handle cache options
  protected async cacheRead<P>(
    operation: string,
    args: any,
    callback: () => Promise<P>,
    options?: CacheOptions
  ): Promise<P> {
    const shouldCache = options?.cache ?? this.defaultCaching;
    const ttl = options?.ttl ?? this.defaultTTL;

    // If caching is disabled, just execute the callback
    if (!shouldCache) {
      return callback();
    }

    const cacheKey = this.getCacheKey(operation, args);

    try {
      const cached = await this.cache.get<P>(cacheKey);
      if (cached !== null) { // Changed from if (cached) to explicitly check for null
        return cached;
      }

      const result = await callback();
      // Only cache if result is not null
      if (result !== null) {
        await this.cache.set(cacheKey, result, ttl);
      }
      return result;

    } catch (error) {
      getConfig().logger?.error(`Cache operation failed: ${error}`);
      return callback();
    }
  }

  // Override methods to use cache options
  public override async findUnique(
    args: Parameters<InstanceType<T>[Model]['findUnique']>[0],
    options?: CacheOptions
  ) {
    const result = await this.cacheRead('findUnique', args, () => super.findUnique(args), options);
    return result;
  }

  public override async findMany(
    args: Parameters<InstanceType<T>[Model]['findMany']>[0],
    options?: CacheOptions
  ) {
    const result = await this.cacheRead('findMany', args, () => super.findMany(args), options);
    return result;
  }

  public override async findFirst(
    args: Parameters<InstanceType<T>[Model]['findFirst']>[0],
    options?: CacheOptions
  ) {
    return this.cacheRead('findFirst', args, () => super.findFirst(args), options);
  }

  public override async count(
    args: Parameters<InstanceType<T>[Model]['count']>[0],
    options?: CacheOptions
  ) {
    return this.cacheRead('count', args, () => super.count(args), options);
  }

  public override async $queryRaw<P = any>(
    query: TemplateStringsArray | Sql,
    ...values: any[]
  ): Promise<P> {
    const lastArg = values[values.length - 1];
    const options = lastArg && typeof lastArg === 'object' && 'cache' in lastArg ?
      values.pop() as CacheOptions :
      undefined;

    return this.cacheRead('$queryRaw', { query, values }, () => super.$queryRaw(query, ...values), options);
  }

  // Cache invalidation for write operations
  protected async invalidateAfterWrite(_operation: string, _args: any): Promise<void> {
    try {
      // Clear all cache entries for this model
      const modelPrefix = `${this.model.$name}:`;
      await this.cache.delete(`${modelPrefix}*`);
    } catch (error) {
      getConfig().logger?.error(`Cache invalidation failed: ${error}`);
    }
  }

  private getCacheKey(operation: string, args: any): string {
    return `${this.model.$name}:${operation}:${JSON.stringify(args)}`;
  }

  // Override example for write operations
  public override async create(
    args: Parameters<InstanceType<T>[Model]['create']>[0]
  ) {
    const result = await super.create(args);
    await this.invalidateAfterWrite('create', args);
    return result;
  }

  public override async createMany(
    args: Parameters<InstanceType<T>[Model]['createMany']>[0]
  ) {
    const result = await super.createMany(args);
    await this.invalidateAfterWrite('createMany', args);
    return result;
  }

  public override async delete(
    args: Parameters<InstanceType<T>[Model]['delete']>[0]
  ) {
    const result = await super.delete(args);
    await this.invalidateAfterWrite('delete', args);
    return result;
  }

  public override async deleteMany(
    args: Parameters<InstanceType<T>[Model]['deleteMany']>[0]
  ) {
    const result = await super.deleteMany(args);
    await this.invalidateAfterWrite('deleteMany', args);
    return result;
  }

  public override async $executeRaw(
    query: TemplateStringsArray | Sql,
    ...values: any[]
  ): Promise<number> {
    const result = await super.$executeRaw(query, ...values);
    await this.invalidateAfterWrite('$executeRaw', { query, values });
    return result;
  }

  public override async update(
    args: Parameters<InstanceType<T>[Model]['update']>[0]
  ) {
    const result = await super.update(args);
    await this.invalidateAfterWrite('update', args);
    return result;
  }

  public override async updateMany(
    args: Parameters<InstanceType<T>[Model]['updateMany']>[0]
  ) {
    const result = await super.updateMany(args);
    await this.invalidateAfterWrite('updateMany', args);
    return result;
  }

  public override async upsert(
    args: Parameters<InstanceType<T>[Model]['upsert']>[0]
  ) {
    const result = await super.upsert(args);
    await this.invalidateAfterWrite('upsert', args);
    return result;
  }

  /**
   * Flush cache entries based on pattern
   */

  public async flush(pattern: FlushPattern = 'all'): Promise<void> {
    try {
      if (pattern === 'all') {
        await this.cache.clear();
        return;
      }

      const { operation, args } = pattern;
      if (operation) {
        if (args) {
          // Delete specific cache entry
          const cacheKey = this.getCacheKey(operation, args);
          await this.cache.delete(cacheKey);
        } else {
          // Delete all entries for specific operation
          const operationPrefix = `${this.model.$name}:${operation}:`;
          await this.cache.delete(`${operationPrefix}*`);
        }
      } else {
        // Delete all entries for this model
        const modelPrefix = `${this.model.$name}:`;
        await this.cache.delete(`${modelPrefix}*`);
      }
    } catch (error) {
      getConfig().logger?.error(`Cache flush failed: ${error}`);
      throw new CacheError('Failed to flush cache', error as Error);
    }
  }


  /**
   * Flush all cache entries for current model
   */
  public async flushAll(): Promise<void> {
    return this.flush('all');
  }

  /**
   * Flush cache entries for specific operation
   */
  public async flushOperation(operation: string): Promise<void> {
    return this.flush({ operation });
  }

  /**
   * Flush cache entry for specific operation and arguments
   */
  public async flushExact(operation: string, args: Record<string, any>): Promise<void> {
    return this.flush({ operation, args });
  }
}
