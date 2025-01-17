// src/cached-repository.ts
import { Sql } from '@prisma/client/runtime/library';
import { BaseRepository } from './base-repository';
import { getConfig } from './config';
import { ModelNames, PrismaClientType, Cache, CacheOptions, CacheError, FlushPattern, PrismaDelegate, ModelOperationTypes, TransactionClient } from './types';
import { defaultSanitizeKey } from './utils';


export class CachedRepository<T extends PrismaClientType, Model extends ModelNames<T>> {
  private currentCacheOptions?: CacheOptions;
  protected defaultTTL: number;
  protected defaultCaching: boolean;
  private readonly _baseRepo: BaseRepository<T, Model>;

  constructor(
    protected cacheInstance: Cache,
    defaultTTL: number = 3600
  ) {
    this._baseRepo = new BaseRepository<T, Model>();

    const config = getConfig();
    this.defaultTTL = config.cacheConfig?.defaultTTL ?? defaultTTL;
    this.defaultCaching = config.cacheConfig?.defaultCaching ?? true;
  }

  // Protected access to base properties
  protected get model() {
    return this._baseRepo['model'];
  }

  protected get prisma() {
    return this._baseRepo['prisma'];
  }

  public trx(trx: TransactionClient) {
    this._baseRepo.trx(trx);
    return this;
  }

  // Method declarations
  public isExist = <
    Where extends Parameters<PrismaDelegate<T, Model>['findFirst']>[0] extends { where?: infer W } ? W : never,
    Select extends Parameters<PrismaDelegate<T, Model>['findFirst']>[0] extends { select?: infer S } ? S : never
  >(
    where: Where,
    select?: Select
  ): Promise<boolean> => {
    return this._baseRepo.isExist(where, select);
  };

  public findManyWithPagination = <
    Args extends Parameters<PrismaDelegate<T, Model>['findMany']>[0] = Parameters<PrismaDelegate<T, Model>['findMany']>[0]
  >(args: {
    page?: number;
    pageSize?: number;
    where?: Args extends { where?: infer W } ? W : never;
    orderBy?: Args extends { orderBy?: infer O } ? O : never;
    select?: Args extends { select?: infer S } ? S : never;
    include?: Args extends { include?: infer I } ? I : never;
  }) => {
    return this._baseRepo.findManyWithPagination(args);
  };

  public restoreById = <
    Args extends Parameters<PrismaDelegate<T, Model>['update']>[0] = Parameters<PrismaDelegate<T, Model>['update']>[0]
  >(
    id: string,
    data?: Args extends { data?: infer D } ? Omit<D, 'deletedAt'> : never
  ): Promise<ModelOperationTypes<T, Model>['update']> => {
    return this._baseRepo.restoreById(id, data);
  };

  // @ts-ignore
  public create: PrismaDelegate<T, Model>['create'] = async (args: any) => {
    const result = await this._baseRepo.create(args);
    await this.invalidateAfterWrite('create', args);
    return result;
  };

  // @ts-ignore
  public createMany: PrismaDelegate<T, Model>['createMany'] = async (args: any) => {
    const result = await this._baseRepo.createMany(args);
    await this.invalidateAfterWrite('createMany', args);
    return result;
  };


  /*======================================================================================= */

  // Add withCache method for chaining
  public cache(options: CacheOptions) {
    this.currentCacheOptions = options;
    return this;
  }

  // Modify the find methods to use currentCacheOptions
  // @ts-ignore
  public findUnique: PrismaDelegate<T, Model>['findUnique'] = async (args: any) => {
    try {
      const shouldCache = this.currentCacheOptions?.cache ?? this.defaultCaching;
      const ttl = this.currentCacheOptions?.ttl ?? this.defaultTTL;
      this.currentCacheOptions = undefined; // Reset after use

      if (!shouldCache) {
        return await this._baseRepo.findUnique(args);
      }

      const cacheKey = this.getCacheKey('findUnique', args);
      const cached = await this.cacheInstance.get<ModelOperationTypes<T, Model>['findUnique']>(cacheKey);

      if (cached !== null) {
        return cached;
      }

      const result = await this._baseRepo.findUnique(args);
      if (result !== null) {
        await this.cacheInstance.set(cacheKey, result, ttl);
      }
      return result;
    } catch (error) {
      getConfig().logger?.error(`Cache operation failed: ${error}`);
      return this._baseRepo.findUnique(args);
    }
  };

  // @ts-ignore
  public findMany: PrismaDelegate<T, Model>['findMany'] = async (args: any) => {
    try {
      const shouldCache = this.currentCacheOptions?.cache ?? this.defaultCaching;
      const ttl = this.currentCacheOptions?.ttl ?? this.defaultTTL;
      this.currentCacheOptions = undefined; // Reset after use

      if (!shouldCache) {
        return await this._baseRepo.findMany(args);
      }

      const cacheKey = this.getCacheKey('findMany', args);
      const cached = await this.cacheInstance.get<ModelOperationTypes<T, Model>['findMany']>(cacheKey);

      if (cached !== null) {
        return cached;
      }

      const result = await this._baseRepo.findMany(args);
      if (result.length > 0) {
        await this.cacheInstance.set(cacheKey, result, ttl);
      }
      return result;
    } catch (error) {
      getConfig().logger?.error(`Cache operation failed: ${error}`);
      return this._baseRepo.findMany(args);
    }
  };

  // @ts-ignore
  public findFirst: PrismaDelegate<T, Model>['findFirst'] = async (args: any) => {
    try {
      const shouldCache = this.currentCacheOptions?.cache ?? this.defaultCaching;
      const ttl = this.currentCacheOptions?.ttl ?? this.defaultTTL;
      this.currentCacheOptions = undefined; // Reset after use

      if (!shouldCache) {
        return await this._baseRepo.findFirst(args);
      }

      const cacheKey = this.getCacheKey('findFirst', args);
      const cached = await this.cacheInstance.get<ModelOperationTypes<T, Model>['findFirst']>(cacheKey);

      if (cached !== null) {
        return cached;
      }

      const result = await this._baseRepo.findFirst(args);
      if (result !== null) {
        await this.cacheInstance.set(cacheKey, result, ttl);
      }
      return result;
    } catch (error) {
      getConfig().logger?.error(`Cache operation failed: ${error}`);
      return this._baseRepo.findFirst(args);
    }
  };

  // @ts-ignore
  public count: PrismaDelegate<T, Model>['count'] = async (args: any) => {
    try {
      const shouldCache = this.currentCacheOptions?.cache ?? this.defaultCaching;
      const ttl = this.currentCacheOptions?.ttl ?? this.defaultTTL;
      this.currentCacheOptions = undefined; // Reset after use

      if (!shouldCache) {
        return await this._baseRepo.count(args);
      }

      const cacheKey = this.getCacheKey('count', args);
      const cached = await this.cacheInstance.get<ModelOperationTypes<T, Model>['count']>(cacheKey);

      if (cached !== null) {
        return cached;
      }

      const result = await this._baseRepo.count(args);
      await this.cacheInstance.set(cacheKey, result, ttl);
      return result;
    } catch (error) {
      getConfig().logger?.error(`Cache operation failed: ${error}`);
      return this._baseRepo.count(args);
    }
  };

  /* ======================================================================================= */
  // @ts-ignore
  public delete: PrismaDelegate<T, Model>['delete'] = async (args: any) => {
    const result = await this._baseRepo.delete(args);
    await this.invalidateAfterWrite('delete', args);
    return result;
  };
  // @ts-ignore
  public deleteMany: PrismaDelegate<T, Model>['deleteMany'] = async (args: any) => {
    const result = await this._baseRepo.deleteMany(args);
    await this.invalidateAfterWrite('deleteMany', args);
    return result;
  };
  // @ts-ignore
  public update: PrismaDelegate<T, Model>['update'] = async (args: any) => {
    const result = await this._baseRepo.update(args);
    await this.invalidateAfterWrite('update', args);
    return result;
  };
  // @ts-ignore
  public updateMany: PrismaDelegate<T, Model>['updateMany'] = async (args: any) => {
    const result = await this._baseRepo.updateMany(args);
    await this.invalidateAfterWrite('updateMany', args);
    return result;
  };

  // @ts-ignore
  public upsert: PrismaDelegate<T, Model>['upsert'] = async (args: any) => {
    const result = await this._baseRepo.upsert(args);
    await this.invalidateAfterWrite('upsert', args);
    return result;
  };

  public async $executeRaw(query: TemplateStringsArray | Sql, ...values: any[]): Promise<number> {
    const result = await this._baseRepo.$executeRaw(query, ...values);
    await this.invalidateAfterWrite('$executeRaw', { query, values });
    return result;
  }

  public async $queryRaw<P = any>(query: TemplateStringsArray | Sql, ...values: any[]): Promise<P> {
    try {
      const shouldCache = this.currentCacheOptions?.cache ?? this.defaultCaching;
      const ttl = this.currentCacheOptions?.ttl ?? this.defaultTTL;
      this.currentCacheOptions = undefined; // Reset after use

      if (!shouldCache) {
        return await this._baseRepo.$queryRaw<P>(query, ...values);
      }

      const cacheKey = this.getCacheKey('$queryRaw', { query, values });
      const cached = await this.cacheInstance.get<P>(cacheKey);

      if (cached !== null) {
        return cached;
      }

      const result = await this._baseRepo.$queryRaw<P>(query, ...values);
      if (result !== null) {
        await this.cacheInstance.set(cacheKey, result, ttl);
      }
      return result;
    } catch (error) {
      getConfig().logger?.error(`Cache operation failed: ${error}`);
      return this._baseRepo.$queryRaw<P>(query, ...values);
    }
  }

  public async $transaction<P>(fn: (prisma: TransactionClient) => Promise<P>): Promise<P> {
    return this._baseRepo.$transaction(fn);
  }

  // Cache management methods
  protected async invalidateAfterWrite(_operation: string, _args: any): Promise<void> {
    try {
      const modelPrefix = `${this.model['$name'].toLowerCase()}:`;
      await this.cacheInstance.delete(`${modelPrefix}*`);
    } catch (error) {
      getConfig().logger?.error(`Cache invalidation failed: ${error}`);
    }
  }

  private getCacheKey(operation: string, args: any): string {
    const modelName = this.model['$name'].toLowerCase();
    operation = operation.toLowerCase();
    const key = `${modelName}:${operation}:${JSON.stringify(args)}`;

    const config = getConfig();
    if (config.cacheConfig?.cacheKeySanitizer) {
      const sanitized = config.cacheConfig.cacheKeySanitizer(key);
      if (sanitized) return sanitized;
    }

    return defaultSanitizeKey(key);
  }

  // Cache flushing methods
  public async flushAll(): Promise<void> {
    return this.flush('all');
  }

  public async flushOperation(operation: string): Promise<void> {
    try {
      const keys = await this.cacheInstance.keys();
      const keysToDelete = keys.filter(key => this.matchesOperation(key, operation));
      await Promise.all(keysToDelete.map(key => this.cacheInstance.delete(key)));
    } catch (error) {
      getConfig().logger?.error(`Cache flush failed: ${error}`);
      throw new CacheError('Failed to flush cache', error as Error);
    }
  }

  public async flushExact(operation: string, args: Record<string, any>): Promise<void> {
    return this.flush({ operation, args });
  }

  private async flush(pattern: FlushPattern = 'all'): Promise<void> {
    try {
      if (pattern === 'all') {
        await this.cacheInstance.clear();
        return;
      }

      const { operation, args } = pattern;
      const modelName = this.model['$name'].toLowerCase();

      if (operation) {
        if (args) {
          const cacheKey = this.getCacheKey(operation, args);
          await this.cacheInstance.delete(cacheKey);
        } else {
          const operationPrefix = `${modelName}:${operation.toLowerCase()}:`;
          const keys = await this.cacheInstance.keys();
          const keysToDelete = keys.filter(key =>
            key.toLowerCase().startsWith(operationPrefix.toLowerCase())
          );
          await Promise.all(keysToDelete.map(key => this.cacheInstance.delete(key)));
        }
      } else {
        const modelPrefix = `${modelName}:`;
        const keys = await this.cacheInstance.keys();
        const keysToDelete = keys.filter(key =>
          key.toLowerCase().startsWith(modelPrefix.toLowerCase())
        );
        await Promise.all(keysToDelete.map(key => this.cacheInstance.delete(key)));
      }
    } catch (error) {
      getConfig().logger?.error(`Cache flush failed: ${error}`);
      throw new CacheError('Failed to flush cache', error as Error);
    }
  }

  private decodeKey(key: string): string {
    const config = getConfig();
    if (config.cacheConfig?.cacheKeySanitizer) {
      return key;
    }

    try {
      return Buffer.from(key, 'base64url').toString();
    } catch {
      return key;
    }
  }

  private matchesOperation(key: string, operation: string): boolean {
    const modelName = this.model['$name'].toLowerCase();
    const operationPattern = `${modelName}:${operation.toLowerCase()}:`;
    const decodedKey = this.decodeKey(key).toLowerCase();
    return decodedKey.includes(operationPattern);
  }
}
