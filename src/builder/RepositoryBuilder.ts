// src/builder/RepositoryBuilder.ts
import { PrismaClient } from '@prisma/client';
import { BaseRepository } from '../facade/BaseRepository';
import { CachedRepository } from '../facade/CachedRepository';
import {
  ModelNames,
  PrismaClientType,
  Cache,
  Logger,
  Config,
} from '../types';
import { setConfig, getConfig } from '../config/config';

export class RepositoryBuilder<
  T extends PrismaClientType = typeof PrismaClient,
  Model extends ModelNames<T> = ModelNames<T>
> {
  private cacheInstance?: Cache;
  private cacheConfig?: {
    defaultTTL?: number;
    defaultCaching?: boolean;
    cacheKeySanitizer?: (key: string) => string | undefined;
  };
  private softDelete: boolean = false;
  private logger?: Logger;
  private timeout?: number;

  /**
   * Enable caching for the repository
   */
  public withCache(cache: Cache, config?: {
    defaultTTL?: number;
    defaultCaching?: boolean;
    cacheKeySanitizer?: (key: string) => string | undefined;
  }): this {
    this.cacheInstance = cache;
    this.cacheConfig = config;
    return this;
  }

  /**
   * Enable soft delete functionality
   */
  public withSoftDelete(enabled: boolean = true): this {
    this.softDelete = enabled;
    return this;
  }

  /**
   * Add logger to the repository
   */
  public withLogger(logger: Logger): this {
    this.logger = logger;
    return this;
  }

  /**
   * Set default timeout for transactions
   */
  public withTimeout(milliseconds: number): this {
    this.timeout = milliseconds;
    return this;
  }

  /**
   * Apply custom configuration
   */
  public withConfig(config: Partial<Config>): this {
    const currentConfig = getConfig();
    setConfig({
      ...currentConfig,
      ...config,
    });
    return this;
  }

  /**
   * Build the repository instance
   */
  public build(): BaseRepository<T, Model> | CachedRepository<T, Model> {
    // Update global configuration
    const config: Config = {
      softDelete: this.softDelete,
      logger: this.logger,
      cacheConfig: this.cacheConfig,
    };

    if (this.timeout) {
      config.transactionOptions = {
        timeout: this.timeout,
      };
    }

    setConfig(config);

    // Create appropriate repository instance
    if (this.cacheInstance) {
      return new CachedRepository<T, Model>(
        this.cacheInstance,
        this.cacheConfig?.defaultTTL
      );
    }

    return new BaseRepository<T, Model>();
  }
}

/**
 * Helper function to create a repository builder
 */
export function createRepository<
  T extends PrismaClientType = typeof PrismaClient,
  Model extends ModelNames<T> = ModelNames<T>
>() {
  return new RepositoryBuilder<T, Model>();
}

/**
 * Type-safe repository creation functions
 */
export function createBaseRepository<
  T extends PrismaClientType,
  Model extends ModelNames<T>
>(config?: Partial<Config>): BaseRepository<T, Model> {
  const builder = new RepositoryBuilder<T, Model>();
  if (config) {
    builder.withConfig(config);
  }
  return builder.build() as BaseRepository<T, Model>;
}

export function createCachedRepository<
  T extends PrismaClientType,
  Model extends ModelNames<T>
>(
  cache: Cache,
  config?: {
    defaultTTL?: number;
    defaultCaching?: boolean;
    cacheKeySanitizer?: (key: string) => string | undefined;
    softDelete?: boolean;
    logger?: Logger;
    timeout?: number;
  }
): CachedRepository<T, Model> {
  const builder = new RepositoryBuilder<T, Model>();

  builder.withCache(cache, {
    defaultTTL: config?.defaultTTL,
    defaultCaching: config?.defaultCaching,
    cacheKeySanitizer: config?.cacheKeySanitizer,
  });

  if (config?.softDelete) {
    builder.withSoftDelete(config.softDelete);
  }

  if (config?.logger) {
    builder.withLogger(config.logger);
  }

  if (config?.timeout) {
    builder.withTimeout(config.timeout);
  }

  return builder.build() as CachedRepository<T, Model>;
}

/**
 * Type guard to check if repository is cached
 */
export function isCachedRepository<
  T extends PrismaClientType,
  Model extends ModelNames<T>
>(
  repository: BaseRepository<T, Model> | CachedRepository<T, Model>
): repository is CachedRepository<T, Model> {
  return 'cache' in repository;
}

/**
 * Repository configuration interface for builder
 */
export interface RepositoryConfig<
  T extends PrismaClientType = typeof PrismaClient,
  Model extends ModelNames<T> = ModelNames<T>
> {
  cache?: {
    instance: Cache;
    defaultTTL?: number;
    defaultCaching?: boolean;
    cacheKeySanitizer?: (key: string) => string | undefined;
  };
  softDelete?: boolean;
  logger?: Logger;
  timeout?: number;
}

/**
 * Factory function to create repository with configuration
 */
export function createRepositoryWithConfig<
  T extends PrismaClientType,
  Model extends ModelNames<T>
>(config?: RepositoryConfig<T, Model>): BaseRepository<T, Model> | CachedRepository<T, Model> {
  const builder = new RepositoryBuilder<T, Model>();

  if (config?.cache) {
    builder.withCache(config.cache.instance, {
      defaultTTL: config.cache.defaultTTL,
      defaultCaching: config.cache.defaultCaching,
      cacheKeySanitizer: config.cache.cacheKeySanitizer,
    });
  }

  if (config?.softDelete) {
    builder.withSoftDelete(config.softDelete);
  }

  if (config?.logger) {
    builder.withLogger(config.logger);
  }

  if (config?.timeout) {
    builder.withTimeout(config.timeout);
  }

  return builder.build();
}

// Usage examples in comments:
/*
// Basic usage
const userRepo = createRepository<PrismaClient, 'user'>()
  .withSoftDelete()
  .build();

// With cache
const cachedUserRepo = createRepository<PrismaClient, 'user'>()
  .withCache(new SomeCache(), { defaultTTL: 3600 })
  .withSoftDelete()
  .build();

// With full configuration
const configuredRepo = createRepository<PrismaClient, 'user'>()
  .withCache(new SomeCache(), {
    defaultTTL: 3600,
    defaultCaching: true,
  })
  .withSoftDelete(true)
  .withLogger(customLogger)
  .withTimeout(5000)
  .build();

// Using factory functions
const baseRepo = createBaseRepository<PrismaClient, 'user'>();
const cachedRepo = createCachedRepository<PrismaClient, 'user'>(new SomeCache());

// Using configuration object
const repoWithConfig = createRepositoryWithConfig<PrismaClient, 'user'>({
  cache: {
    instance: new SomeCache(),
    defaultTTL: 3600,
  },
  softDelete: true,
  logger: customLogger,
  timeout: 5000,
});
*/
