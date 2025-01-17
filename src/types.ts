// src/types.ts
import { PrismaClient } from '@prisma/client';
import { CachedRepository } from './cached-repository';
import { BaseRepository } from './base-repository';

export type PrismaClientType = typeof PrismaClient;

export type ExtractModelName<T> = T extends CachedRepository<any, infer M>
  ? M
  : T extends BaseRepository<any, infer M>
  ? M
  : never;

// Updated ModelNames type
export type ModelNames<T extends PrismaClientType> = keyof Omit<
  InstanceType<T>,
  | '$connect'
  | '$disconnect'
  | '$on'
  | '$transaction'
  | '$use'
  | '$extends'
>;

// Helper type to get model type from PrismaClient
export type PrismaModel<T extends PrismaClientType, M extends ModelNames<T>> =
  InstanceType<T>[M];

// Helper type to get model delegate type
export type PrismaDelegate<T extends PrismaClientType, M extends ModelNames<T>> =
  InstanceType<T>[M] extends { [K: string]: any }
  ? InstanceType<T>[M]
  : never;


export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// Update ModelOperationTypes to use PrismaDelegate
export type ModelOperationTypes<T extends PrismaClientType, M extends ModelNames<T>> = {
  create: Awaited<ReturnType<PrismaDelegate<T, M>['create']>>;
  createMany: Awaited<ReturnType<PrismaDelegate<T, M>['createMany']>>;
  findMany: Awaited<ReturnType<PrismaDelegate<T, M>['findMany']>>[];
  findFirst: Awaited<ReturnType<PrismaDelegate<T, M>['findFirst']>> | null;
  findUnique: Awaited<ReturnType<PrismaDelegate<T, M>['findUnique']>> | null;
  update: Awaited<ReturnType<PrismaDelegate<T, M>['update']>>;
  updateMany: Awaited<ReturnType<PrismaDelegate<T, M>['updateMany']>>;
  delete: Awaited<ReturnType<PrismaDelegate<T, M>['delete']>>;
  deleteMany: Awaited<ReturnType<PrismaDelegate<T, M>['deleteMany']>>;
  upsert: Awaited<ReturnType<PrismaDelegate<T, M>['upsert']>>;
  count: number;
};

export interface CacheOperation {
  type: 'get' | 'set' | 'delete' | 'clear';
  key: string;
  timestamp: Date;
}

// src/types.ts
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>
}

export type FlushPattern = {
  operation?: string;
  args?: Record<string, any>;
} | 'all';

export interface CacheOptions {
  cache?: boolean;
  ttl?: number;
}

export interface GlobalCacheConfig {
  defaultCaching?: boolean;
  defaultTTL?: number;
}
export interface Config {
  logger?: Logger;
  softDelete?: boolean;
  cacheConfig?: GlobalCacheConfig & {
    cacheKeySanitizer?: (key: string, args?: any) => string | undefined;
  };
  transactionOptions?: TransactionOptions;
}
export interface Logger {
  info(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

export interface TransactionOptions {
  timeout?: number;
  maxRetries?: number;
}

export class RepositoryError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class CacheError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'CacheError';
  }
}
