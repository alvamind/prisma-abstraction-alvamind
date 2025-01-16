// src/cached-repository.ts
import { Sql } from '@prisma/client/runtime/library';
import { BaseRepository } from './base-repository';
import { getConfig } from './config';
import { ModelNames, PrismaClientType, Cache } from './types';

export abstract class CachedRepository<T extends PrismaClientType, Model extends ModelNames<T>> extends BaseRepository<T, Model> {
  protected defaultTTL: number;

  constructor(
    protected cache: Cache,
    defaultTTL: number = 3600 // 1 hour default
  ) {
    super();
    this.defaultTTL = defaultTTL;
  }

  // Enhanced caching for read operations
  protected async cacheRead<P>(
    operation: string,
    args: any,
    callback: () => Promise<P>
  ): Promise<P> {
    const cacheKey = this.getCacheKey(operation, args);

    try {
      // Try to get from cache first
      const cached = await this.cache.get<P>(cacheKey);
      if (cached) {
        return cached;
      }

      // If not in cache, execute operation and cache result
      const result = await callback();
      if (result) {
        await this.cache.set(cacheKey, result, this.defaultTTL); // Fixed: Using defaultTTL instead of CACHE_TTL
      }
      return result;

    } catch (error) {
      // On cache error, fallback to direct database query
      getConfig().logger?.error(`Cache operation failed: ${error}`);
      return callback();
    }
  }

  // Cache invalidation for write operations
  protected async invalidateAfterWrite(operation: string, args: any): Promise<void> {
    try {
      // Clear specific cache entry
      const cacheKey = this.getCacheKey(operation, args);
      await this.cache.delete(cacheKey);

      // Clear related list caches
      await this.cache.delete(`${this.model.$name}:list:*`);

    } catch (error) {
      // Log cache invalidation error but don't block operation
      getConfig().logger?.error(`Cache invalidation failed: ${error}`);
    }
  }

  private getCacheKey(operation: string, args: any): string {
    return `${this.model.$name}:${operation}:${JSON.stringify(args)}`;
  }

  // Override example for read operation
  public override async findUnique(
    args: Parameters<InstanceType<T>[Model]['findUnique']>[0]
  ) {
    return this.cacheRead('findUnique', args, () => super.findUnique(args));
  }

  public override async findMany(
    args: Parameters<InstanceType<T>[Model]['findMany']>[0]
  ) {
    return this.cacheRead('findMany', args, () => super.findMany(args));
  }

  public override async findFirst(
    args: Parameters<InstanceType<T>[Model]['findFirst']>[0]
  ) {
    return this.cacheRead('findFirst', args, () => super.findFirst(args));
  }

  public override async $queryRaw<P = any>(
    query: TemplateStringsArray | Sql,
    ...values: any[]
  ): Promise<P> {
    return this.cacheRead('$queryRaw', { query, values }, () => super.$queryRaw(query, ...values));
  }

  public override async count(
    args: Parameters<InstanceType<T>[Model]['count']>[0]
  ) {
    return this.cacheRead('count', args, () => super.count(args));
  }

  // Override example for write operation
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
}
