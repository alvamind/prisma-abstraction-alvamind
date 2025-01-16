// src/cached-repository.ts
import { BaseRepository } from './base-repository';
import { ModelNames, PrismaClientType } from './types';

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export abstract class CachedRepository<
  T extends PrismaClientType,
  Model extends ModelNames<T>
> extends BaseRepository<T, Model> {
  constructor(
    protected cache: Cache,
    protected defaultTTL: number = 3600
  ) {
    super();
  }

  protected async withCache<P>(
    key: string,
    fn: () => Promise<P>,
    ttl: number = this.defaultTTL
  ): Promise<P> {
    const cached = await this.cache.get<P>(key);
    if (cached) return cached;

    const result = await fn();
    await this.cache.set(key, result, ttl);
    return result;
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

  // Add more cached methods as needed
}
