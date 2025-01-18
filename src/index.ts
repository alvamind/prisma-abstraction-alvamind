// src/index.ts

// Core exports
export * from './core/operations';
export * from './core/caching';

// Re-export facade classes
export { BaseRepository } from './facade/BaseRepository';
export { CachedRepository } from './facade/CachedRepository';

// Re-export builders
export {
  RepositoryBuilder,
  createRepository,
  createBaseRepository,
  createCachedRepository,
  createRepositoryWithConfig,
  isCachedRepository,
  type RepositoryConfig
} from './builder/RepositoryBuilder';

// Decorator exports
export {
  type OperationDecorator,
  type OperationFunction,
  createOperationDecorator,
  composeDecorators
} from './decorators/operationDecorator';

export {
  createCacheDecorator,
  createCacheInvalidator,
  createCacheManager,
  type CacheManager,
  type CachedOperation
} from './decorators/cache';

// export {
//   createTransactionDecorator,
//   executeTransaction,
//   isInTransaction,
//   getTransactionClient,
//   type WithTransaction,
//   type TransactionOptions
// } from './decorators/transaction';

// Configuration exports
export {
  setConfig,
  getConfig,
  setPrismaClient,
  getPrismaClient,
  ConfigManager
} from './config/config';

// Type exports
export {
  type PrismaClientType,
  type ModelNames,
  type PrismaDelegate,
  type TransactionClient,
  type ModelOperationTypes,
  type CacheOperation,
  type Cache,
  type CacheOptions,
  type CacheConfig,
  type Logger,
  type Config,
  type PaginationOptions,
  type PaginatedResult,
  type PaginationMeta,
  RepositoryError,
  CacheError,
  TransactionError
} from './types';

// Utility exports
export {
  defaultSanitizeKey,
  createCacheKey,
  parseCacheKey,
  withTimeout,
  retry,
  type RetryOptions
} from './utils/utils';

// Import classes and objects for default export
import { BaseRepository } from './facade/BaseRepository';
import { CachedRepository } from './facade/CachedRepository';
import { RepositoryBuilder } from './builder/RepositoryBuilder';
import { ConfigManager } from './config/config';

// Default export with proper object notation
export default {
  BaseRepository: BaseRepository,
  CachedRepository: CachedRepository,
  RepositoryBuilder: RepositoryBuilder,
  ConfigManager: ConfigManager
};
